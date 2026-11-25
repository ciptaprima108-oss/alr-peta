// Layar masuk ALR: setiap orang masuk dengan No. ID (5 angka) + PIN (6 angka).
// PIN tidak disimpan di aplikasi: docs/akun.json hanya berisi cek PIN (sha256 dari PBKDF2-SHA256 + garam per orang),
// dicocokkan di HP. Masuk pertama wajib buat PIN sendiri; ganti PIN di Profil. Ini pintu masuk aplikasi, bukan pengaman data (data peta memang publik di GitHub).
// Setelah masuk, "alr_saya" otomatis diisi No. ID supaya sapaan, ID card, dan nama pelapor ikut orang yang masuk.
(() => {
  const $ = (id) => document.getElementById(id);
  const baca = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const tulis = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const LAMA = 30 * 864e5;                                   // tetap masuk 30 hari di HP ini
  const sesi = () => { const s = baca("alr_masuk", null); return s && s.exp > Date.now() ? s : null; };
  const cariOrang = (kode) => (window.ALR_PENGGUNA || []).find((p) => p.id === kode);
  const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  const dariHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));

  // ---------- PIN ----------
  // akun.json v2: { garam, cek = sha256(PBKDF2(PIN, garam)), awal }. Saat ganti PIN, HP mengirim PBKDF2 PIN lama
  // sebagai bukti (bukan PIN-nya) lewat kotak surat laporan; GitHub Action mencocokkan sha256(bukti) dengan cek
  // lalu memperbarui akun.json. Sampai itu tayang (~5-10 menit), HP ini memakai PIN baru dari "alr_pin_baru".
  const acak = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
  async function turunan(pin, garam, iterasi) {
    const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
    return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: dariHex(garam), iterations: iterasi }, k, 256));
  }
  const sha = async (h) => hex(await crypto.subtle.digest("SHA-256", dariHex(h)));
  async function muatAkun() {
    if (!crypto?.subtle) throw new Error("Browser ini terlalu lama. Buka lewat aplikasi ALR atau Chrome terbaru.");
    try { const r = await fetch(`akun.json?t=${Date.now()}`, { cache: "no-store" }); if (!r.ok) throw 0; return await r.json(); }
    catch { throw new Error("Tidak ada sinyal. Coba lagi sebentar."); }
  }
  function akunDari(d, kode) {
    const a = d.akun?.[kode]; if (!a) return null;
    const tunda = baca("alr_pin_baru", {}), t = tunda[kode];
    if (t) {
      if (a.cek === t.lama) return { ...a, garam: t.garam, cek: t.cek, awal: false, server: a.cek };   // PIN baru belum tayang di server
      delete tunda[kode]; tulis("alr_pin_baru", tunda);                                // sudah tayang / diganti di HP lain
    }
    return a;
  }
  async function cocok(kode, pin) {
    const d = await muatAkun(), a = akunDari(d, kode);
    if (!a) return null;
    const bukti = await turunan(pin, a.garam, d.iterasi || 150000);
    return (await sha(bukti)) === a.cek ? { a, bukti, iterasi: d.iterasi || 150000 } : null;
  }
  function cekPinBaru(pin, ulang, lama) {
    if (!/^\d{6}$/.test(pin)) return "PIN baru harus 6 angka.";
    if (/^(\d)\1{5}$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) return "PIN terlalu gampang ditebak (contoh 111111 atau 123456). Pilih yang lain.";
    if (lama && pin === lama) return "PIN baru harus beda dari PIN lama.";
    if (pin !== ulang) return "PIN yang diulang tidak sama.";
    return "";
  }
  async function kirimGanti(kode, hasil, pinBaru) {
    const cfg = await fetch("lapor.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({}));
    if (!cfg.relay) throw new Error("Aplikasi belum tersambung. Hubungi Developer.");
    const garam = acak(16), cek = await sha(await turunan(pinBaru, garam, hasil.iterasi));
    const rid = ("p" + Date.now().toString(36) + acak(3)).slice(0, 20);
    let j;
    try {
      const r = await fetch(cfg.relay, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ rid, baru: { label: "ganti-pin", judul: `[PIN] ${kode}`, isi: "-" }, pin: { kode, bukti: hasil.bukti, garam, cek } }) });
      j = await r.json();
    } catch { throw new Error("Tidak ada sinyal. PIN belum diganti, coba lagi."); }
    if (!j.ok) throw new Error(j.pesan || "PIN belum bisa diganti, coba lagi.");
    const tunda = baca("alr_pin_baru", {}); tunda[kode] = { garam, cek, lama: hasil.a.server || hasil.a.cek, t: Date.now() }; tulis("alr_pin_baru", tunda);
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
      <button type="button" class="masuk-pelapor" id="masukPelapor"><b>📸 Saya pelapor lapangan</b><small>Checker, operator, mandor, patroli. Tanpa No. ID, cuma untuk kirim laporan.</small></button>
      <p class="masuk-bantu">Lupa PIN atau belum punya No. ID? Hubungi Developer aplikasi (Fanza / Reza).</p>
    </form>
    <form class="masuk-kartu" id="formPinAwal" hidden novalidate>
      <img class="masuk-logo" src="ikon/logo_alr.png" alt="ALR">
      <h1>Buat PIN kamu</h1>
      <p class="masuk-sub" id="pinAwalSapa">Ini masuk pertama kamu.</p>
      <p class="masuk-info">Ganti PIN dari Developer dengan PIN 6 angka pilihan kamu sendiri. Jangan kasih tahu orang lain.</p>
      <label>PIN baru<input id="pinAwal1" type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" placeholder="6 angka"></label>
      <label>Ulangi PIN baru<input id="pinAwal2" type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" placeholder="6 angka"></label>
      <p class="masuk-pesan" id="pinAwalPesan" role="alert"></p>
      <button type="submit" class="masuk-tombol" id="pinAwalTombol">Simpan PIN &amp; masuk</button>
      <button type="button" class="masuk-batal" id="pinAwalBatal">Kembali</button>
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
      const h = await cocok(kode, pin);
      if (!h) { pesan.textContent = "No. ID atau PIN salah."; return; }
      $("masukPin").value = "";
      if (h.a.awal) return mintaPinAwal(kode, h, pin);            // masuk pertama: wajib buat PIN sendiri dulu
      masukSebagai(kode);
    } catch (er) { pesan.textContent = er.message; }
    finally { t.disabled = false; t.textContent = "Masuk"; }
  };

  const masukSebagai = (kode) => { tulis("alr_masuk", { kode, exp: Date.now() + LAMA }); pasangOrang(kode, true); tutup(); };
  let awal = null;
  function mintaPinAwal(kode, h, pinLama) {
    awal = { kode, h, pinLama };
    const p = cariOrang(kode);
    $("pinAwalSapa").textContent = `Halo${p ? ", " + p.nama : ""}. Ini masuk pertama kamu.`;
    $("formMasuk").hidden = true; $("formPinAwal").hidden = false; $("pinAwalPesan").textContent = "";
    setTimeout(() => $("pinAwal1").focus(), 50);
  }
  ["pinAwal1", "pinAwal2"].forEach((id) => $(id).addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6); }));
  $("pinAwalBatal").onclick = () => { awal = null; $("formPinAwal").reset(); $("formPinAwal").hidden = true; $("formMasuk").hidden = false; };
  $("formPinAwal").onsubmit = async (e) => {
    e.preventDefault(); if (!awal) return;
    const a = $("pinAwal1").value, b = $("pinAwal2").value, pesan = $("pinAwalPesan");
    const salah = cekPinBaru(a, b, awal.pinLama); if (salah) { pesan.textContent = salah; return; }
    const t = $("pinAwalTombol"); t.disabled = true; t.textContent = "Menyimpan..."; pesan.textContent = "";
    try {
      await kirimGanti(awal.kode, awal.h, a);
      const kode = awal.kode; awal = null; $("formPinAwal").reset(); $("formPinAwal").hidden = true; $("formMasuk").hidden = false;
      masukSebagai(kode);
    } catch (er) { pesan.textContent = er.message; }
    finally { t.disabled = false; t.textContent = "Simpan PIN & masuk"; }
  };

  // isi identitas aplikasi dari orang yang masuk
  function pasangOrang(kode, baru) {
    tulis("alr_saya", kode);
    const p = cariOrang(kode);
    if (baru) tulis("alr_lapor_nama", p?.nama || null);       // HP dipakai gantian: nama pelapor ikut orang yang masuk
    if (window.ALR_PENGGUNA) window.dispatchEvent(new CustomEvent("alr:pengguna", { detail: window.ALR_PENGGUNA }));   // sapaan + ID card ikut berubah
    isiAkun();
  }

  function keluar(diam) {
    const s = baca("alr_masuk", null);
    tulis("alr_masuk", null); tulis("alr_saya", null); tulis("alr_lapor_nama", null);
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
      <div class="pf-baris"><span class="pf-ik" style="--w:#7A5AF8"><svg class="ik"><use href="#i-info"/></svg></span><div><b>Ganti PIN</b><small>Buat PIN baru 6 angka. Lupa PIN? Hubungi Developer (Fanza / Reza).</small></div>
        <button type="button" class="pf-tombol" id="btnGantiPin">Ganti</button></div>
      <form class="akun-pin" id="formPin" hidden novalidate>
        <label>PIN lama<input id="pinLama" type="password" inputmode="numeric" autocomplete="current-password" maxlength="6" placeholder="6 angka"></label>
        <label>PIN baru<input id="pinBaru" type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" placeholder="6 angka"></label>
        <label>Ulangi PIN baru<input id="pinUlang" type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" placeholder="6 angka"></label>
        <p class="masuk-pesan" id="pinPesan" role="alert"></p>
        <div class="akun-aksi"><button type="button" class="pf-tombol abu" id="pinBatal">Batal</button><button type="submit" class="pf-tombol" id="pinSimpan">Simpan PIN</button></div>
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
  ["pinLama", "pinBaru", "pinUlang"].forEach((id) => $(id)?.addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6); }));
  $("btnGantiPin") && ($("btnGantiPin").onclick = () => { $("formPin").hidden = false; $("pinPesan").className = "masuk-pesan"; $("pinPesan").textContent = ""; $("pinLama").focus(); });
  $("pinBatal") && ($("pinBatal").onclick = () => { $("formPin").reset(); $("formPin").hidden = true; });
  $("formPin") && ($("formPin").onsubmit = async (e) => {
    e.preventDefault();
    const s = sesi(), lama = $("pinLama").value, a = $("pinBaru").value, b = $("pinUlang").value, pesan = $("pinPesan");
    pesan.className = "masuk-pesan"; if (!s) return;
    const salah = cekPinBaru(a, b, lama); if (salah) { pesan.textContent = salah; return; }
    const t = $("pinSimpan"); t.disabled = true; pesan.textContent = "Menyimpan...";
    try {
      const h = await cocok(s.kode, lama);
      if (!h) { pesan.textContent = "PIN lama salah."; return; }
      await kirimGanti(s.kode, h, a);
      $("formPin").reset(); pesan.className = "masuk-pesan oke";
      pesan.textContent = "PIN baru tersimpan. Di HP ini langsung berlaku, di HP lain paling lama 10 menit lagi.";
      setTimeout(() => { $("formPin").hidden = true; }, 4000);
    } catch (er) { pesan.textContent = er.message; }
    finally { t.disabled = false; }
  });
  $("btnKeluarAkun") && ($("btnKeluarAkun").onclick = () => {
    const t = $("btnKeluarAkun");
    if (!t.dataset.yakin) { t.dataset.yakin = "1"; t.textContent = "Yakin keluar?"; return setTimeout(() => { delete t.dataset.yakin; t.textContent = "Keluar"; }, 4000); }
    keluar(false);
  });

  // ---------- mode pelapor lapangan (tanpa No. ID, hanya layar lapor) ----------
  const keModePelapor = () => { tulis("alr_mode_pelapor", true); lapis.hidden = true; document.body.classList.remove("perlu-masuk"); document.body.classList.add("mode-pelapor");
    window.dispatchEvent(new CustomEvent("alr:pelapor")); };
  $("masukPelapor").onclick = keModePelapor;
  window.ALR_keluarPelapor = () => { tulis("alr_mode_pelapor", null); document.body.classList.remove("mode-pelapor"); $("masukPesan").textContent = ""; tunjuk(); };

  // ---------- mulai ----------
  window.ALR_keluar = () => keluar(false);
  const s = sesi();
  if (/[?&]pelapor\b/.test(location.search)) tulis("alr_mode_pelapor", true);
  if (!s && baca("alr_mode_pelapor", false)) { lapis.hidden = true; document.body.classList.add("mode-pelapor"); }
  else if (!s) { tulis("alr_masuk", null); tunjuk(); }
  else {
    tutup(); pasangOrang(s.kode, false);
    // yang sudah masuk sebelum ada aturan "buat PIN sendiri": minta masuk ulang sekali supaya PIN-nya diganti
    muatAkun().then((d) => { const a = akunDari(d, s.kode); if (!a || a.awal) { keluar(true); $("masukPesan").textContent = "Silakan masuk lagi, lalu buat PIN kamu sendiri."; } }).catch(() => {});
  }
})();
