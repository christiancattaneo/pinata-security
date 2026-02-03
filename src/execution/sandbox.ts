/**
 * Layer 5: Docker Sandbox Management
 * 
 * Creates and manages isolated Docker containers for safe test execution.
 * Security-first design: no network, limited resources, unprivileged user.
 */

import { spawn } from "child_process";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import type { 
  SandboxConfig, 
  ContainerState, 
  ExecutionLanguage,
  TestFramework 
} from "./types.js";
import { DEFAULT_SANDBOX_CONFIG } from "./types.js";

/** Sandbox manager for Docker-based test execution */
export class Sandbox {
  private config: SandboxConfig;
  private tempDir: string | null = null;
  private containerId: string | null = null;

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_SANDBOX_CONFIG, ...config };
  }

  /**
   * Check if Docker is available
   */
  async isDockerAvailable(): Promise<boolean> {
    try {
      const result = await this.exec("docker", ["version", "--format", "{{.Server.Version}}"]);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Check if sandbox image exists, build if not
   */
  async ensureImage(): Promise<boolean> {
    const result = await this.exec("docker", ["image", "inspect", this.config.image]);
    
    if (result.exitCode !== 0) {
      console.log(`Sandbox image ${this.config.image} not found. Building...`);
      return this.buildImage();
    }
    
    return true;
  }

  /**
   * Build the sandbox Docker image
   */
  private async buildImage(): Promise<boolean> {
    const dockerfile = this.generateDockerfile();
    
    // Create temp directory for build context
    const buildDir = await mkdtemp(join(tmpdir(), "pinata-sandbox-"));
    await writeFile(join(buildDir, "Dockerfile"), dockerfile);
    
    try {
      const result = await this.exec("docker", [
        "build",
        "-t", this.config.image,
        buildDir,
      ], { timeout: 120000 }); // 2 min build timeout
      
      return result.exitCode === 0;
    } finally {
      await rm(buildDir, { recursive: true, force: true });
    }
  }

  /**
   * Generate Dockerfile for sandbox
   */
  private generateDockerfile(): string {
    return `
FROM node:20-slim

# Security: run as non-root user
RUN groupadd -r sandbox && useradd -r -g sandbox sandbox

# Install test frameworks
RUN npm install -g vitest@2 @vitest/ui typescript tsx

# Create sandbox directory
WORKDIR /sandbox
RUN chown sandbox:sandbox /sandbox

# Switch to non-root user
USER sandbox

# Default command
CMD ["sh"]
`.trim();
  }

  /**
   * Prepare sandbox with test files
   */
  async prepare(
    testCode: string,
    targetCode: string,
    language: ExecutionLanguage
  ): Promise<string> {
    // Create temp directory for this execution
    this.tempDir = await mkdtemp(join(tmpdir(), "pinata-exec-"));
    
    // Write test and target files
    const testFile = language === "python" ? "test_exploit.py" : "exploit.test.ts";
    const targetFile = language === "python" ? "target.py" : "target.ts";
    
    await writeFile(join(this.tempDir, testFile), testCode);
    await writeFile(join(this.tempDir, targetFile), targetCode);
    
    // Write minimal package.json for Node.js
    if (language === "typescript" || language === "javascript") {
      await writeFile(join(this.tempDir, "package.json"), JSON.stringify({
        name: "pinata-exploit-test",
        type: "module",
        scripts: {
          test: "vitest run --reporter=json",
        },
      }, null, 2));
      
      // Write vitest config
      await writeFile(join(this.tempDir, "vitest.config.ts"), `
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    testTimeout: 10000,
  },
});
`);
    }
    
    return this.tempDir;
  }

  /**
   * Run test in sandbox container
   */
  async run(framework: TestFramework): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
  }> {
    if (!this.tempDir) {
      throw new Error("Sandbox not prepared. Call prepare() first.");
    }

    const args = this.buildDockerArgs(framework);
    
    const result = await this.exec("docker", args, {
      timeout: this.config.timeoutSeconds * 1000,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
    };
  }

  /**
   * Build Docker run arguments with security constraints
   */
  private buildDockerArgs(framework: TestFramework): string[] {
    const testCommand = this.getTestCommand(framework);
    
    const args = [
      "run",
      "--rm",                                    // Remove container after exit
      "--cpus", this.config.cpuLimit,           // CPU limit
      "--memory", this.config.memoryLimit,       // Memory limit
      "--read-only",                             // Read-only root filesystem
      "--tmpfs", "/tmp:rw,size=64m,mode=1777",  // Writable tmp
      "--user", "1000:1000",                     // Non-root user
      "--cap-drop", "ALL",                       // Drop all capabilities
      "--security-opt", "no-new-privileges",    // No privilege escalation
      "-v", `${this.tempDir}:${this.config.workDir}:rw`,  // Mount test files
      "-w", this.config.workDir,                 // Working directory
    ];

    // Network isolation (default: no network)
    if (!this.config.networkEnabled) {
      args.push("--network", "none");
    }

    // Add image and command
    args.push(this.config.image);
    args.push(...testCommand);

    return args;
  }

  /**
   * Get test command for framework
   */
  private getTestCommand(framework: TestFramework): string[] {
    switch (framework) {
      case "vitest":
        return ["npx", "vitest", "run", "--reporter=json"];
      case "jest":
        return ["npx", "jest", "--json"];
      case "pytest":
        return ["python", "-m", "pytest", "-v", "--tb=short"];
      case "go-test":
        return ["go", "test", "-v", "-json"];
      default:
        return ["npx", "vitest", "run"];
    }
  }

  /**
   * Cleanup sandbox resources
   */
  async cleanup(): Promise<void> {
    if (this.tempDir) {
      try {
        await rm(this.tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      this.tempDir = null;
    }

    if (this.containerId) {
      try {
        await this.exec("docker", ["rm", "-f", this.containerId]);
      } catch {
        // Ignore cleanup errors
      }
      this.containerId = null;
    }
  }

  /**
   * Execute a command and capture output
   */
  private exec(
    command: string,
    args: string[],
    options: { timeout?: number } = {}
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
  }> {
    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      const timeout = options.timeout ?? 30000;
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGKILL");
      }, timeout);

      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 1,
          timedOut,
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr: stderr + "\n" + err.message,
          exitCode: 1,
          timedOut: false,
        });
      });
    });
  }
}

/**
 * Create a new sandbox instance
 */
export function createSandbox(config?: Partial<SandboxConfig>): Sandbox {
  return new Sandbox(config);
}
