// Service Worker: zeigt Push-Nachrichten (Pausen-Ende) an und öffnet die App beim Antippen.
// Absichtlich ohne Cache, damit Updates sofort ankommen.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let data = {};
  try { data = e.data?.json() ?? {} } catch { data = { title: e.data?.text() } }
  e.waitUntil(self.registration.showNotification(data.title || "BWAU", {
    body: data.body || "",
    icon: "icon-180.png",
    badge: "icon-180.png",
    tag: "bwau-rest",
    renotify: true,
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = all.find(c => c.url.startsWith(self.registration.scope));
    if (open) return open.focus();
    return self.clients.openWindow(self.registration.scope + "#training");
  })());
});
