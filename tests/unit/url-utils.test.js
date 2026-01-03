import { afterEach, describe, expect, test, vi } from "vitest";
import Logger, { LogLevel } from "@script-utils/logger.js";
import { safeParseUrl } from "@utils/url-utils.js";

describe("safeParseUrl", () => {
  let warnSpy;
  let debugSpy;

  afterEach(() => {
    warnSpy?.mockRestore();
    debugSpy?.mockRestore();
  });

  test("parses absolute URLs", () => {
    const result = safeParseUrl("https://example.com/path");
    expect(result).toBeInstanceOf(URL);
    expect(result.hostname).toBe("example.com");
  });

  test("parses relative URLs with a base", () => {
    const result = safeParseUrl("/docs", "https://example.com/base");
    expect(result).toBeInstanceOf(URL);
    expect(result.href).toBe("https://example.com/docs");
  });

  test("returns null for invalid URLs and stays silent when requested", () => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = safeParseUrl("http://[invalid", undefined, {
      level: "silent",
    });
    expect(result).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("logs a warning for invalid URLs by default", () => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = safeParseUrl("http://[invalid");
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  test("uses debug level when specified", () => {
    debugSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const previousLevel = Logger.getLevel();
    Logger.setLevel(LogLevel.DEBUG);
    const result = safeParseUrl("http://[invalid", undefined, {
      level: "debug",
      context: "test",
      prefix: "TestPrefix",
    });
    expect(result).toBeNull();
    expect(debugSpy).toHaveBeenCalledTimes(1);
    Logger.setLevel(previousLevel);
  });
});
