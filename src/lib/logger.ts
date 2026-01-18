import chalk from "chalk";

/**
 * Log levels from most to least verbose
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

/**
 * Logger configuration
 */
interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
}

/**
 * Simple logger with colored output
 */
class Logger {
  private level: LogLevel = "info";
  private prefix: string = "";

  /**
   * Configure the logger
   */
  configure(config: Partial<LoggerConfig>): void {
    if (config.level !== undefined) {
      this.level = config.level;
    }
    if (config.prefix !== undefined) {
      this.prefix = config.prefix;
    }
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  /**
   * Format a message with optional prefix
   */
  private format(message: string): string {
    return this.prefix ? `${this.prefix} ${message}` : message;
  }

  /**
   * Debug level logging (gray)
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog("debug")) {
      console.debug(chalk.gray(this.format(message)), ...args);
    }
  }

  /**
   * Info level logging (default color)
   */
  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog("info")) {
      console.info(this.format(message), ...args);
    }
  }

  /**
   * Warning level logging (yellow)
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog("warn")) {
      console.warn(chalk.yellow(this.format(message)), ...args);
    }
  }

  /**
   * Error level logging (red)
   */
  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog("error")) {
      console.error(chalk.red(this.format(message)), ...args);
    }
  }

  /**
   * Success message (green)
   */
  success(message: string, ...args: unknown[]): void {
    if (this.shouldLog("info")) {
      console.info(chalk.green(this.format(message)), ...args);
    }
  }

  /**
   * Create a child logger with a prefix
   */
  child(prefix: string): Logger {
    const child = new Logger();
    child.level = this.level;
    child.prefix = this.prefix ? `${this.prefix} ${prefix}` : prefix;
    return child;
  }
}

/**
 * Global logger instance
 */
export const logger = new Logger();
