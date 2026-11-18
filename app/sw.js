/* Pip & Alder Radio service worker: offline shell, fresh feeds, downloaded audio with Range support. */
const SHELL = "par-shell-v1", AUDIO = "par-audio-v1", FEEDS = "par-feeds-v1";
const SHELL_FILES = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  "../off-world/cover.jpg", "../wow-forever/cover.jpg"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![SHELL, AUDIO, FEEDS].includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function audioFromCache(req) {
  const c = await caches.open(AUDIO);
  const hit = await c.match(req.url);
  if (!hit) return null;
  const range = req.headers.get("range");
  if (!range) return hit;
  const buf = await hit.arrayBuffer(), size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : size - 1;
  if (!m[1] && m[2]) { start = size - +m[2]; end = size - 1; }
  end = Math.min(end, size - 1);
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), { status: 206, headers: {
    "Content-Type": "audio/mpeg", "Content-Range": `bytes ${start}-${end}/${size}`,
    "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" } });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (/\.mp3($|\?)/i.test(url.pathname)) {
    e.respondWith(audioFromCache(req).then(r => r || fetch(req)));
    return;
  }
  if (url.pathname.endsWith("/feed.xml")) {
    e.respondWith(fetch(req, { cache: "no-cache" }).then(r => {
      const copy = r.clone(); if (r.ok) caches.open(FEEDS).then(c => c.put(url.pathname, copy)); return r;
    }).catch(() => caches.open(FEEDS).then(c => c.match(url.pathname)).then(r => r || Response.error())));
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
  }
});
