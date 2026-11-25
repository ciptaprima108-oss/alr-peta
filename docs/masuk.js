// Layar masuk ALR: setiap orang masuk dengan No. ID (5 angka) + PIN (6 angka).
// PIN tidak disimpan di aplikasi: docs/akun.json hanya berisi sidik PIN (PBKDF2-SHA256 + garam per orang),
// dicocokkan di HP. Ini pintu masuk aplikasi, bukan pengaman data (data peta memang publik di GitHub).
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

  async function cocok(kode, pin) {
    let d;
    try { const r = await fetch(`akun.json?t=${Date.now()}`, { cache: "no-store" }); if (!r.ok) throw 0; d = await r.json(); }
    catch { throw new Error("Tidak ada sinyal. Coba lagi sebentar."); }
    const a = d.akun?.[kode]; if (!a) return false;
    if (!crypto?.subtle) throw new Error("Browser ini terlalu lama. Buka lewat aplikasi ALR atau Chrome terbaru.");
    const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
    const b = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: dariHex(a.garam), iterations: d.iterasi || 150000 }, k, 256);
    return hex(b) === a.hash;
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
      if (!(await cocok(kode, pin))) { pesan.textContent = "No. ID atau PIN salah."; return; }
      tulis("alr_masuk", { kode, exp: Date.now() + LAMA });
      $("masukPin").value = "";
      pasangOrang(kode, true);
      tutup();
    } catch (er) { pesan.textContent = er.message; }
    finally { t.disabled = false; t.textContent = "Masuk"; }
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
      <div class="pf-baris"><span class="pf-ik" style="--w:#7A5AF8"><svg class="ik"><use href="#i-info"/></svg></span><div><b>Ganti PIN / lupa PIN</b><small>Hubungi Developer aplikasi (Fanza / Reza).</small></div></div>
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
  $("btnKeluarAkun") && ($("btnKeluarAkun").onclick = () => {
    const t = $("btnKeluarAkun");
    if (!t.dataset.yakin) { t.dataset.yakin = "1"; t.textContent = "Yakin keluar?"; return setTimeout(() => { delete t.dataset.yakin; t.textContent = "Keluar"; }, 4000); }
    keluar(false);
  });

  // ---------- mulai ----------
  window.ALR_keluar = () => keluar(false);
  const s = sesi();
  if (!s) { tulis("alr_masuk", null); tunjuk(); }
  else { tutup(); pasangOrang(s.kode, false); }
})();
