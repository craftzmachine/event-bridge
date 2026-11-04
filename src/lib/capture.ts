/**
 * Screen-capture detection for the client proposal viewer — the best a web page can do.
 *
 * Browsers expose no screenshot event on any platform; only installed apps get one (Android FLAG_SECURE,
 * iOS UIApplication.userDidTakeScreenshotNotification / UIScreen.isCaptured, Windows SetWindowDisplayAffinity).
 * What a page *can* see:
 *  - Windows / Linux: the Print Screen key (Chrome and Edge deliver its keyup; Firefox both) — detected.
 *  - macOS: ⌘⇧3 / ⌘⇧4 / ⌘⇧5 sometimes reach the page before the system takes over — detected when they do.
 *  - Windows Snipping Tool (Win+Shift+S), Game Bar, macOS screenshot app: the page only notices it lost focus.
 *  - Android / iOS screenshots: nothing at all. Switching apps hides the page (visibilitychange).
 */

export type CapturePlatform = "windows" | "mac" | "android" | "ios" | "other";

export function capturePlatform(ua = typeof navigator === "undefined" ? "" : navigator.userAgent, touchPoints = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints): CapturePlatform {
  if (/android/i.test(ua)) return "android";
  // iPadOS reports itself as a Mac; touch support gives it away
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && touchPoints > 1)) return "ios";
  if (/windows/i.test(ua)) return "windows";
  if (/macintosh|mac os x/i.test(ua)) return "mac";
  return "other";
}

/** True when a key event is a known screenshot shortcut that reached the page. */
export function isCaptureShortcut(e: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "shiftKey">): boolean {
  if (e.key === "PrintScreen" || e.code === "PrintScreen") return true;
  return e.metaKey && e.shiftKey && /^Digit[3456]$/.test(e.code);
}
