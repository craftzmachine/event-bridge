import { describe, expect, it } from "vitest";
import { capturePlatform, isCaptureShortcut } from "./capture";

const key = (k: Partial<KeyboardEvent>) => ({ key: "", code: "", metaKey: false, shiftKey: false, ...k });

describe("screen-capture detection", () => {
  it("recognises the screenshot shortcuts a page can see", () => {
    expect(isCaptureShortcut(key({ key: "PrintScreen", code: "PrintScreen" }))).toBe(true);
    expect(isCaptureShortcut(key({ key: "Unidentified", code: "PrintScreen" }))).toBe(true);
    expect(isCaptureShortcut(key({ key: "#", code: "Digit3", metaKey: true, shiftKey: true }))).toBe(true);
    expect(isCaptureShortcut(key({ key: "$", code: "Digit4", metaKey: true, shiftKey: true }))).toBe(true);
    expect(isCaptureShortcut(key({ key: "%", code: "Digit5", metaKey: true, shiftKey: true }))).toBe(true);
    // ordinary keys and near misses are left alone
    expect(isCaptureShortcut(key({ key: "3", code: "Digit3", metaKey: true }))).toBe(false);
    expect(isCaptureShortcut(key({ key: "S", code: "KeyS", metaKey: true, shiftKey: true }))).toBe(false);
    expect(isCaptureShortcut(key({ key: "a", code: "KeyA" }))).toBe(false);
  });

  it("tells the platforms apart, including iPads that report as a Mac", () => {
    expect(capturePlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130", 0)).toBe("windows");
    expect(capturePlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile", 5)).toBe("android");
    expect(capturePlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari", 5)).toBe("ios");
    expect(capturePlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari", 5)).toBe("ios");
    expect(capturePlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari", 0)).toBe("mac");
  });
});
