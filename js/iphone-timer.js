// The native app exposes this handler only to the BWAU page.
export const nativeTimer = window.webkit?.messageHandlers?.bwauRest;
export const iPhoneWeb = !nativeTimer && /iPhone/i.test(navigator.userAgent);

export function shortcutURL(end, now = Date.now()) {
  const seconds = Math.ceil((end - now) / 1000);
  if (!Number.isSafeInteger(seconds) || seconds <= 0) return null;
  return "shortcuts://run-shortcut?name=BWAU%20Pause&input=text&text=" + seconds;
}

export function nativePause(rest, active) {
  if (!rest || !active) return { action: "cancel" };
  const exercise = active.items.find(item => item.rows.some(row => !row.id))?.exercise;
  return { action: "rest", end: rest.end, label: exercise || active.title || "Nächster Satz" };
}
