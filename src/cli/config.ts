/**
 * Configuration Management
 *
 * Handles persistent storage of user configuration like API keys.
 * Uses OS-appropriate config directory with secure file permissions.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { z } from "zod";

const CONFIG_DIR = join(homedir(), ".pinata");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/**
 * Configuration schema
 */
const ConfigSchema = z.object({
  anthropicApiKey: z.string().optional(),
  openaiApiKey: z.string().optional(),
  defaultProvider: z.enum(["anthropic", "openai"]).optional(),
  telemetry: z.boolean().optional(),
});

type Config = z.infer<typeof ConfigSchema>;

/**
 * Ensure config directory exists with secure permissions
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Load configuration from disk
 */
export function loadConfig(): Config {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return {};
    }
    const content = readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    const result = ConfigSchema.safeParse(parsed);
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}

/**
 * Save configuration to disk with secure permissions
 */
export function saveConfig(config: Config): void {
  ensureConfigDir();
  const content = JSON.stringify(config, null, 2);
  writeFileSync(CONFIG_FILE, content, { mode: 0o600 });
  // Ensure file permissions are restricted
  chmodSync(CONFIG_FILE, 0o600);
}

/**
 * Set a single configuration value
 */
export function setConfigValue<K extends keyof Config>(key: K, value: Config[K]): void {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
}

/**
 * Get a single configuration value
 */
export function getConfigValue<K extends keyof Config>(key: K): Config[K] {
  const config = loadConfig();
  return config[key];
}

/**
 * Delete a configuration value
 */
export function deleteConfigValue(key: keyof Config): void {
  const config = loadConfig();
  delete config[key];
  saveConfig(config);
}

/**
 * Get API key (from config file or environment)
 * Environment variables take precedence
 */
export function getApiKey(provider: "anthropic" | "openai"): string | undefined {
  const envVar = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  const envValue = process.env[envVar];
  if (envValue !== undefined && envValue.length > 0) {
    return envValue;
  }

  const config = loadConfig();
  return provider === "anthropic" ? config.anthropicApiKey : config.openaiApiKey;
}

/**
 * Check if API key is configured for a provider
 */
export function hasApiKey(provider: "anthropic" | "openai"): boolean {
  const key = getApiKey(provider);
  return key !== undefined && key.length > 0;
}

/**
 * Get configured provider (or default)
 */
export function getDefaultProvider(): "anthropic" | "openai" {
  const config = loadConfig();
  return config.defaultProvider ?? "anthropic";
}

/**
 * Mask API key for display (show first/last 4 chars)
 */
export function maskApiKey(key: string): string {
  if (key.length <= 12) {
    return "****";
  }
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/**
 * Validate API key format
 */
export function validateApiKey(provider: "anthropic" | "openai", key: string): { valid: boolean; error?: string } {
  if (key.length === 0) {
    return { valid: false, error: "API key cannot be empty" };
  }

  if (provider === "anthropic") {
    if (!key.startsWith("sk-ant-")) {
      return { valid: false, error: "Anthropic API keys should start with 'sk-ant-'" };
    }
  } else if (provider === "openai") {
    if (!key.startsWith("sk-")) {
      return { valid: false, error: "OpenAI API keys should start with 'sk-'" };
    }
  }

  return { valid: true };
}

/**
 * Get config file path (for display purposes)
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}
