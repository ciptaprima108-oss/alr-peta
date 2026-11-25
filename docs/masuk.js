// Layar masuk ALR: setiap orang masuk dengan No. ID (5 angka) + PIN (6 angka).
// Akun dibuat di Supabase Auth (supabase/pengguna_awal.sql). Alamat login = <No. ID>@alr.example (buatan, tidak dipakai kirim email).
// Sesi disimpan di HP ini (localStorage "alr_sesi"); setelah masuk, "alr_saya" otomatis diisi No. ID supaya
// sapaan, ID card, dan nama pelapor ikut orang yang masuk.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DOMAIN = "@alr.example";
  const baca = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const tulis = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const sesi = () => baca("alr_sesi", null);
  const cariOrang = (kode) => (window.ALR_PENGGUNA || []).find((p) => p.id === kode);

  async function auth(path, opsi = {}) {
    const c = await window.ALR_db?.konfig?.();
    if (!c?.url || !c?.key) throw new Error("Aplikasi belum tersambung ke database.");
    let r;
    try {
      r = await fetch(`${c.url.replace(/\/$/, "")}/auth/v1/${path}`, { ...opsi, headers: { apikey: c.key, "Content-Type": "application/json", ...(opsi.headers || {}) } });
    } catch { throw new Error("Tidak ada sinyal. Coba lagi sebentar."); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error_description || j.msg || j.message || `Gagal (${r.status})`); e.status = r.status; throw e; }
    return j;
  }
  function simpanSesi(j, kode) {
    tulis("alr_sesi", { at: j.access_token, rt: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000, kode });
    jadwalPerbarui();
  }
  let pewaktu = 0;
  function jadwalPerbarui() {
    clearTimeout(pewaktu);
    const s = sesi(); if (!s) return;
    pewaktu = setTimeout(perbarui, Math.max(10000, s.exp - Date.now() - 120000));
  }
  async function perbarui() {
    const s = sesi(); if (!s?.rt) return false;
    try { simpanSesi(await auth("token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: s.rt }) }), s.kode); return true; }
    catch (e) {
      if (e.status >= 400 && e.status < 500) { keluar(true); return false; }   // sesi ditolak: masuk ulang
      pewaktu = setTimeout(perbarui, 60000); return true;                       // cuma sinyal: tetap pakai sesi lama, coba lagi
    }
  }

  // ---------- tampilan ----------
  const lapis = document.createElement("div");
  lapis.className = "masuk"; lapis.id = "layarMasuk"; lapis.hidden = true;
  lapis.setAttribute("role", "dialog"); lapis.setAttribute("aria-modal", "true"); lapis.setAttribute("aria-labelledby", "masukJudul");
  lapis.innerHTML = `
    <form class="masuk-kartu" id="formMasuk" novalidate autocomplete="on">
      <img class="masuk-logo" src="ikon/logo_alr.png" alt="ALR">
      <h1 id="masukJudul">Masuk ALR</h1>
      <p class="masuk-sub">Jalan Hauling ALR, BSR ke 107</p>
      <label>No. ID<input id="masukId" name="username" inputmode="numeric" autocomplete="username" maxlength="5" placeholder="contoh: 01001" required></label>
      <label>PIN<span class="masuk-pin"><input id="masukPin" name="password" type="password" inputmode="numeric" autocomplete="current-password" maxlength="12" placeholder="6 angka" required>
        <button type="button" class="masuk-lihat" id="masukLihat" aria-label="Lihat PIN">Lihat</button></span></label>
      <p class="masuk-pesan" id="masukPesan" role="alert"></p>
      <button type="submit" class="masuk-tombol" id="masukTombol">Masuk</button>
      <p class="masuk-bantu">Lupa PIN atau belum punya No. ID? Hubungi Developer aplikasi (Fanza / Reza).</p>
    </form>`;
  document.body.appendChild(lapis);

  const tunjuk = () => { lapis.hidden = false; document.body.classList.add("perlu-masuk"); document.body.classList.remove("sudah-masuk"); setTimeout(() => $("masukId").focus(), 50); };
  const tutup = () => { lapis.hidden = true; document.body.classList.remove("perlu-masuk"); document.body.classList.add("sudah-masuk"); };

  $("masukLihat").onclick = () => { const i = $("masukPin"), l = i.type === "password"; i.type = l ? "text" : "password"; $("masukLihat").textContent = l ? "Tutup" : "Lihat"; };
  $("masukId").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 5); });
  $("formMasuk").onsubmit = async (e) => {
    e.preventDefault();
    const kode = $("masukId").value.trim(), pin = $("masukPin").value.trim(), pesan = $("masukPesan");
    if (!/^\d{5}$/.test(kode)) { pesan.textContent = "No. ID harus 5 angka, contoh 01001."; return $("masukId").focus(); }
    if (pin.length < 6) { pesan.textContent = "PIN minimal 6 angka."; return $("masukPin").focus(); }
    const t = $("masukTombol"); t.disabled = true; t.textContent = "Memeriksa..."; pesan.textContent = "";
    try {
      simpanSesi(await auth("token?grant_type=password", { method: "POST", body: JSON.stringify({ email: kode + DOMAIN, password: pin }) }), kode);
      $("masukPin").value = "";
      pasangOrang(kode, true);
      tutup();
    } catch (er) {
      pesan.textContent = er.status === 400 || er.status === 401 ? "No. ID atau PIN salah." : er.message;
    } finally { t.disabled = false; t.textContent = "Masuk"; }
  };

  // isi identitas aplikasi dari orang yang masuk
  function pasangOrang(kode, baru) {
    tulis("alr_saya", kode);
    const p = cariOrang(kode);
    if (baru) tulis("alr_lapor_nama", p?.nama || null);       // HP dipakai gantian: nama pelapor ikut orang yang masuk
    if (window.ALR_PENGGUNA) window.dispatchEvent(new CustomEvent("alr:pengguna", { detail: window.ALR_PENGGUNA }));   // sapaan + ID card ikut berubah
    isiAkun();
  }

  async function keluar(diam) {
    const s = sesi();
    tulis("alr_sesi", null); tulis("alr_saya", null); tulis("alr_lapor_nama", null); clearTimeout(pewaktu);
    if (s?.at && !diam) auth("logout", { method: "POST", headers: { Authorization: `Bearer ${s.at}` } }).catch(() => {});
    if (window.ALR_PENGGUNA) window.dispatchEvent(new CustomEvent("alr:pengguna", { detail: window.ALR_PENGGUNA }));
    $("masukId").value = s?.kode || "";
    $("masukPesan").textContent = diam ? "Sesi habis. Silakan masuk lagi." : "";
    tunjuk();
  }

  // ---------- bagian Akun di Profil ----------
  const grup = document.createElement("div");
  grup.innerHTML = `<h3 class="pf-judul">Akun</h3>
    <div class="pf-grup" id="pfAkun">
      <div class="pf-baris"><span class="pf-ik" style="--w:#0B4EA2"><svg class="ik"><use href="#i-orang"/></svg></span><div><b id="akunNama">-</b><small id="akunKet">-</small></div></div>
      <div class="pf-baris"><span class="pf-ik" style="--w:#7A5AF8"><svg class="ik"><use href="#i-info"/></svg></span><div><b>Ganti PIN</b><small>Buat PIN baru 6 angka yang hanya kamu tahu.</small></div>
        <button type="button" class="pf-tombol" id="btnGantiPin">Ganti</button></div>
      <form class="akun-pin" id="formPin" hidden novalidate>
        <label>PIN baru<input id="pinBaru" type="password" inputmode="numeric" autocomplete="new-password" maxlength="12" placeholder="6 angka"></label>
        <label>Ulangi PIN baru<input id="pinUlang" type="password" inputmode="numeric" autocomplete="new-password" maxlength="12" placeholder="6 angka"></label>
        <p class="masuk-pesan" id="pinPesan" role="alert"></p>
        <div class="akun-aksi"><button type="button" class="pf-tombol abu" id="pinBatal">Batal</button><button type="submit" class="pf-tombol">Simpan PIN</button></div>
      </form>
      <div class="pf-baris"><span class="pf-ik" style="--w:#E5341F"><svg class="ik"><use href="#i-kiri"/></svg></span><div><b>Keluar</b><small>Keluar dari akun ini di HP ini.</small></div>
        <button type="button" class="pf-tombol abu" id="btnKeluarAkun">Keluar</button></div>
    </div>`;
  const kepala = document.querySelector("#lyr-profil .pf-kepala");
  if (kepala) kepala.after(...grup.children);

  function isiAkun() {
    const s = sesi(); if (!s || !$("akunNama")) return;
    const p = cariOrang(s.kode);
    $("akunNama").textContent = p ? `${p.nama}` : `No. ID ${s.kode}`;
    $("akunKet").textContent = p ? `No. ID ${s.kode} · ${p.divisi}` : "Sudah masuk";
  }
  window.addEventListener("alr:pengguna", isiAkun);
  $("btnGantiPin") && ($("btnGantiPin").onclick = () => { $("formPin").hidden = false; $("pinPesan").textContent = ""; $("pinBaru").focus(); });
  $("pinBatal") && ($("pinBatal").onclick = () => { $("formPin").reset(); $("formPin").hidden = true; });
  $("formPin") && ($("formPin").onsubmit = async (e) => {
    e.preventDefault();
    const a = $("pinBaru").value.trim(), b = $("pinUlang").value.trim(), pesan = $("pinPesan");
    if (!/^\d{6,12}$/.test(a)) return (pesan.textContent = "PIN harus angka, minimal 6.");
    if (a !== b) return (pesan.textContent = "PIN yang diulang tidak sama.");
    pesan.className = "masuk-pesan"; pesan.textContent = "Menyimpan...";
    try {
      if (sesi()?.exp < Date.now() + 30000) await perbarui();
      await auth("user", { method: "PUT", headers: { Authorization: `Bearer ${sesi()?.at}` }, body: JSON.stringify({ password: a }) });
      $("formPin").reset(); pesan.className = "masuk-pesan oke"; pesan.textContent = "PIN baru tersimpan. Pakai PIN ini saat masuk berikutnya.";
      setTimeout(() => { $("formPin").hidden = true; }, 2500);
    } catch (er) { pesan.textContent = /same|different/i.test(er.message) ? "PIN baru harus beda dari PIN lama." : er.message; }
  });
  $("btnKeluarAkun") && ($("btnKeluarAkun").onclick = () => {
    const t = $("btnKeluarAkun");
    if (!t.dataset.yakin) { t.dataset.yakin = "1"; t.textContent = "Yakin keluar?"; return setTimeout(() => { delete t.dataset.yakin; t.textContent = "Keluar"; }, 4000); }
    keluar(false);
  });

  // ---------- mulai ----------
  window.ALR_keluar = () => keluar(false);
  const s = sesi();
  if (!s) tunjuk();
  else {
    tutup(); pasangOrang(s.kode, false); jadwalPerbarui();
    if (s.exp < Date.now() + 120000) perbarui();
  }
})();
