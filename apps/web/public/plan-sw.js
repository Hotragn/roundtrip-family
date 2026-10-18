// The adult child's service worker (scope /plan/): shows a safety alert sent by the server
// (lib/server/push.ts) and opens their week when it's tapped. It caches nothing; the parents'
// app has its own worker at /parents. Payload: { title, body, url }, first names and the
// outing's details only. Docs: https://developer.mozilla.org/docs/Web/API/ServiceWorkerGlobalScope/push_event
self.addEventListener("push", (event) => {
  let msg = { title: "Roundtrip", body: "Open their week.", url: "/plan" };
  try {
    msg = { ...msg, ...event.data.json() };
  } catch {}
  const url = typeof msg.url === "string" && msg.url.startsWith("/plan/") ? msg.url : "/plan";
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      icon: "/icon.svg",
      tag: url,
      renotify: true,
      requireInteraction: true,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/plan";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).pathname === url);
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
