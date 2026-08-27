/**
 * Minimal leveled logger for the plugin.
 *
 * All plugin logging goes through this module so the verbosity shown in the
 * developer console can be controlled from the plugin settings. The level is
 * global and is applied to every module of the plugin.
 */
export enum LogLevel {
    DEBUG = "debug",
    INFO = "info",
    WARN = "warn",
    ERROR = "error",
    NONE = "none",
}

/**
 * Returns all selectable log levels in display order.
 */
export function getLogLevelOptions(): LogLevel[] {
    return [
        LogLevel.DEBUG,
        LogLevel.INFO,
        LogLevel.WARN,
        LogLevel.ERROR,
        LogLevel.NONE,
    ];
}

export class Logger {
    private static level: LogLevel = LogLevel.INFO;

    /**
     * Sets the global log level. Messages below this level are suppressed.
     *
     * @param level the new log level
     */
    public static setLevel(level: LogLevel): void {
        Logger.level = level;
    }

    /**
     * Returns the currently configured log level.
     */
    public static getLevel(): LogLevel {
        return Logger.level;
    }

    public static debug(message?: unknown, ...optionalParams: unknown[]): void {
        if (Logger.level === LogLevel.DEBUG) {
            console.debug(message, ...optionalParams);
        }
    }

    public static info(message?: unknown, ...optionalParams: unknown[]): void {
        if (
            Logger.level === LogLevel.DEBUG ||
            Logger.level === LogLevel.INFO
        ) {
            console.info(message, ...optionalParams);
        }
    }

    public static warn(message?: unknown, ...optionalParams: unknown[]): void {
        if (
            Logger.level === LogLevel.DEBUG ||
            Logger.level === LogLevel.INFO ||
            Logger.level === LogLevel.WARN
        ) {
            console.warn(message, ...optionalParams);
        }
    }

    public static error(
        message?: unknown,
        ...optionalParams: unknown[]
    ): void {
        if (Logger.level !== LogLevel.NONE) {
            console.error(message, ...optionalParams);
        }
    }
}
