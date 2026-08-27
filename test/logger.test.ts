import { Logger, LogLevel, getLogLevelOptions } from "../src/logger";

describe("Logger", () => {
    let originalDebug: typeof console.debug;
    let originalInfo: typeof console.info;
    let originalWarn: typeof console.warn;
    let originalError: typeof console.error;

    beforeEach(() => {
        originalDebug = console.debug;
        originalInfo = console.info;
        originalWarn = console.warn;
        originalError = console.error;

        console.debug = jest.fn();
        console.info = jest.fn();
        console.warn = jest.fn();
        console.error = jest.fn();

        Logger.setLevel(LogLevel.INFO);
    });

    afterEach(() => {
        console.debug = originalDebug;
        console.info = originalInfo;
        console.warn = originalWarn;
        console.error = originalError;

        jest.clearAllMocks();
    });

    it("should expose the selectable log levels", () => {
        expect(getLogLevelOptions()).toEqual([
            LogLevel.DEBUG,
            LogLevel.INFO,
            LogLevel.WARN,
            LogLevel.ERROR,
            LogLevel.NONE,
        ]);
    });

    it("should suppress debug messages by default (INFO level)", () => {
        Logger.debug("debug message");
        Logger.info("info message");

        expect(console.debug).not.toHaveBeenCalled();
        expect(console.info).toHaveBeenCalledWith("info message");
    });

    it("should emit debug messages at DEBUG level", () => {
        Logger.setLevel(LogLevel.DEBUG);
        Logger.debug("debug message");

        expect(console.debug).toHaveBeenCalledWith("debug message");
    });

    it("should suppress info messages at WARN level", () => {
        Logger.setLevel(LogLevel.WARN);
        Logger.info("info message");
        Logger.warn("warn message");

        expect(console.info).not.toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalledWith("warn message");
    });

    it("should suppress warn messages at ERROR level", () => {
        Logger.setLevel(LogLevel.ERROR);
        Logger.warn("warn message");
        Logger.error("error message");

        expect(console.warn).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalledWith("error message");
    });

    it("should suppress everything at NONE level", () => {
        Logger.setLevel(LogLevel.NONE);
        Logger.error("error message");

        expect(console.error).not.toHaveBeenCalled();
    });
});
