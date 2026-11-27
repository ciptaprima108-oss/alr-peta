// Service worker ALR: notifikasi + aplikasi tetap bisa dibuka tanpa sinyal.
// - File berversi (?v=...) dan pustaka CDN: ambil dari simpanan HP dulu (isinya tidak berubah untuk alamat yang sama).
// - Halaman utama: jaringan dulu, tunggu paling lama 5 detik, lalu pakai simpanan.
// - Lainnya (data jalan, gambar): jaringan dulu, simpanan kalau tidak ada sinyal.
const SIMPAN = "alr-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function taruh(req, res) {
  if (!res || !(res.ok || res.type === "opaque")) return;
  const c = await caches.open(SIMPAN), u = new URL(req.url);
  if (u.search.startsWith("?v=")) for (const k of await c.keys()) { const ku = new URL(k.url); if (ku.origin === u.origin && ku.pathname === u.pathname && ku.search !== u.search) c.delete(k); }
  await c.put(req, res);
}
const dariSimpanan = (req, o) => caches.open(SIMPAN).then((c) => c.match(req, o));
// alamat dengan ?t=... (anti-simpan) disimpan tanpa ekornya, supaya simpanan tidak menumpuk dan tetap ketemu saat tanpa sinyal
const kunci = (req) => { const u = new URL(req.url); return req.mode === "navigate" || u.search.startsWith("?t=") ? new Request(u.origin + u.pathname) : req; };
async function jaringanDulu(req0, batasMs) {
  const req = kunci(req0);
  const net = fetch(req0).then((res) => { taruh(req, res.clone()).catch(() => {}); return res; });
  if (batasMs) {
    const lama = await dariSimpanan(req);
    if (lama) return Promise.race([net.catch(() => lama), new Promise((ok) => setTimeout(() => ok(lama), batasMs))]);
  }
  try { return await net; } catch (e) { const lama = await dariSimpanan(req); if (lama) return lama; throw e; }
}
async function simpananDulu(req) {
  const lama = await dariSimpanan(req); if (lama) return lama;
  const res = await fetch(req); taruh(req, res.clone()).catch(() => {}); return res;
}
self.addEventListener("fetch", (e) => {
  const req = e.request; if (req.method !== "GET") return;
  const u = new URL(req.url), sini = u.origin === self.location.origin;
  const pustaka = /cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(u.hostname);
  if (!sini && !pustaka) return;                                   // tiket, cuaca, peta satelit, relay: langsung ke jaringan
  if (sini && /\/(versi\.txt|sw\.js)$/.test(u.pathname)) return;   // cek versi selalu dari jaringan
  if (pustaka || (sini && u.search.startsWith("?v="))) return e.respondWith(simpananDulu(req));
  e.respondWith(jaringanDulu(req, req.mode === "navigate" ? 5000 : 0));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((w) => {
    for (const c of w) if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); }
    return clients.openWindow(url);
  }));
});
