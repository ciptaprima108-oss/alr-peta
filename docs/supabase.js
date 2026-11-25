// Sambungan ke database Supabase ALR (tanpa library, cukup fetch ke REST API).
// Alamat + anon key diambil dari docs/lapor.json: { "supabase": { "url": "https://xxx.supabase.co", "key": "..." } }
// Anon key memang publik; hak akses diatur oleh aturan RLS di supabase/skema.sql.
(() => {
  let cfg = null;
  const muat = () => cfg || (cfg = fetch("lapor.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).then((j) => j.supabase || null).catch(() => null));
  // token login pengguna (dari masuk.js); kalau ada, permintaan berjalan sebagai pengguna yang sudah masuk
  const tokenSaya = () => { try { const x = JSON.parse(localStorage.getItem("alr_sesi") || "null"); return x && x.exp > Date.now() + 30000 ? x.at : ""; } catch { return ""; } };
  async function minta(path, opsi = {}) {
    const c = await muat();
    if (!c?.url || !c?.key) throw new Error("supabase-belum-diatur");
    const r = await fetch(`${c.url.replace(/\/$/, "")}/rest/v1/${path}`, {
      ...opsi,
      headers: { apikey: c.key, ...(tokenSaya() ? { Authorization: `Bearer ${tokenSaya()}` } : c.key.startsWith("eyJ") ? { Authorization: `Bearer ${c.key}` } : {}), "Content-Type": "application/json", ...(opsi.headers || {}) },
    });
    if (!r.ok) throw new Error(`supabase ${r.status}: ${(await r.text()).slice(0, 150)}`);
    const t = await r.text(); return t ? JSON.parse(t) : null;
  }
  window.ALR_db = {
    minta,
    konfig: muat,
    aktif: async () => !!(await muat())?.url,
    // simpan 1 laporan; rid sama tidak akan dobel
    simpanLaporan: (baris) => minta("laporan?on_conflict=rid", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(baris) }),
    ambilLaporan: (n = 50) => minta(`laporan?select=*&order=waktu.desc&limit=${n}`),
  };
})();
