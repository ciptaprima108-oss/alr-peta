// Beranda ALR gaya aplikasi: sapaan, cari, nilai jalan per hari, "Hari ini", banner geser, menu ikon, peringatan, menu bawah, kotak masuk.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const simpan = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
                   set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const koma = (v) => String(v).replace(".", ",");
  const klik = () => window.ALR_klik?.();
  const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const tgl = (s) => new Date(s + "T00:00:00");
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fmtSta = (s) => { let km = Math.floor(s + 1e-9), m = Math.round((s - km) * 1000); if (m === 1000) { km++; m = 0; } return `${km}+${String(m).padStart(3, "0")}`; };
  const jamMenit = (m) => { if (m == null) return "-"; m = Math.round(m); const j = Math.floor(m / 60), s = m % 60; return j ? `${j} jam${s ? " " + s + " mnt" : ""}` : `${s} mnt`; };
  const kurang = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // angka naik pelan-pelan (efek hitung)
  function hitung(el, ke, ms = 900) {
    if (kurang) { el.textContent = ke; return; }
    const t0 = performance.now();
    const f = (t) => { const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(ke * e); if (p < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }

  // ---------- sapaan & jam ----------
  function salam() {
    const d = new Date(), h = d.getHours();
    const w = h < 4 ? "malam" : h < 11 ? "pagi" : h < 15 ? "siang" : h < 18 ? "sore" : "malam";
    const saya = (window.ALR_PENGGUNA || []).find((p) => (p.id || p.nama) === simpan.get("alr_saya", ""));
    $("sapaSalam").textContent = `Selamat ${w}${saya ? ", " + saya.nama.trim().split(/\s+/)[0] : ""}`;
    const jam = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
    $("sapaWaktu").textContent = `${d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })}, ${jam} WIB`;
  }
  salam(); setInterval(salam, 30000); window.addEventListener("alr:pengguna", salam);
  $("pfSaya")?.addEventListener("change", () => setTimeout(salam, 50));

  // strip "menyegarkan" di bawah header
  const segar = $("segar");
  new MutationObserver(() => { if (!/memuat/i.test($("info").textContent)) segar.classList.add("siap"); }).observe($("info"), { childList: true, characterData: true, subtree: true });
  segar.onclick = () => { klik(); segar.classList.remove("siap"); setTimeout(() => location.reload(), 250); };

  // ---------- nilai jalan per hari ----------
  const WARNA = { LAYAK: "#34C759", KURANG: "#F2B705", TIDAK: "#FF5A43", KOSONG: "#5B6B80" };
  const JUDUL = { LAYAK: "Kondisi baik", KURANG: "Perlu perhatian", TIDAK: "Perlu perbaikan", KOSONG: "Belum ada data" };
  function namaHari(s) {
    const d = tgl(s), hariIni = new Date(); hariIni.setHours(0, 0, 0, 0);
    const beda = Math.round((hariIni - d) / 864e5);
    const pendek = `${d.getDate()} ${BULAN[d.getMonth()]}`;
    return beda === 0 ? `hari ini, ${pendek}` : beda === 1 ? `kemarin, ${pendek}` : `${d.toLocaleDateString("id-ID", { weekday: "long" })}, ${pendek}`;
  }
  function kartuHari(H) {
    const a = H.hari, el = $("kartuHari");
    el.classList.remove("skel");
    if (!a.length) { $("khJudul").textContent = "Belum ada data"; return; }
    // pembanding: hari sebelumnya yang datanya lengkap (ada GPS). Hari tanpa GPS nilainya tidak bisa dipercaya.
    const t = a[a.length - 1], k = [...a.slice(0, -1)].reverse().find((x) => x.lengkap), r = t.r, w = WARNA[r.kode] || WARNA.KOSONG;
    el.style.setProperty("--w", w);
    $("khTgl").textContent = `Nilai jalan ${namaHari(t.tanggal)}`;
    $("khJudul").textContent = JUDUL[r.kode];
    // cincin nilai
    const R = 42, K = 2 * Math.PI * R, isi = K * (1 - r.nilai / 100);
    $("khCincin").innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${R}" fill="none" class="kh-jalur" stroke-width="10"/>
      <circle class="kh-busur" cx="50" cy="50" r="${R}" fill="none" stroke="${w}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${K.toFixed(1)}" stroke-dashoffset="${K.toFixed(1)}" transform="rotate(-90 50 50)"/></svg>
      <b id="khAngka">0</b><small>dari 100</small>`;
    requestAnimationFrame(() => requestAnimationFrame(() => { const b = el.querySelector(".kh-busur"); if (b) b.style.strokeDashoffset = isi.toFixed(1); }));
    hitung($("khAngka"), r.nilai);
    // banding dengan hari sebelumnya yang ada datanya
    if (k) {
      const d = r.nilai - k.r.nilai, dk = tgl(k.tanggal);
      const dari = `${HARI[dk.getDay()]} ${dk.getDate()} ${BULAN[dk.getMonth()]}`;
      $("khBanding").innerHTML = d === 0 ? `<span class="kb sama">Sama dengan ${dari} (${k.r.nilai})</span>`
        : `<span class="kb ${d > 0 ? "naik" : "turun"}"><svg class="ik"><use href="#i-${d > 0 ? "naik" : "turun"}"/></svg>${d > 0 ? "Naik" : "Turun"} ${Math.abs(d)} dari ${dari} (${k.r.nilai})</span>`;
    } else $("khBanding").innerHTML = "";
    // batang 7 hari terakhir
    const tujuh = a.slice(-7);
    $("khBatang").innerHTML = tujuh.map((x, i) => {
      const d = tgl(x.tanggal), akhir = i === tujuh.length - 1;
      const ok = x.lengkap || akhir;
      return `<div class="kb-hari${akhir ? " akhir" : ""}${ok ? "" : " kurang"}" title="${d.getDate()} ${BULAN[d.getMonth()]}: ${ok ? "nilai " + x.r.nilai : "data GPS kurang"}"><span class="kb-n">${ok ? x.r.nilai : "?"}</span>
        <i style="--h:${ok ? Math.max(8, x.r.nilai) : 30}%;--w:${ok ? WARNA[x.r.kode] : "#8A97A8"};--d:${i * 60}ms"></i><small>${HARI[d.getDay()]}</small></div>`;
    }).join("");
    // apa yang menurunkan nilai (cek silang: hujan, KM pelan, jalan merah, lama rit, berhenti) + seberapa yakin
    const chip = (t) => `<span class="kh-chip${/hujan/i.test(t) ? " hujan" : /merah/i.test(t) ? " merah" : ""}">${esc(t)}</span>`;
    let teks = t.alasan.length ? `<div class="kh-chips">${t.alasan.slice(0, 4).map(chip).join("")}</div>` : "";
    if (t.yakin && t.yakin !== "tinggi") teks += `<div class="kh-ragu"><svg class="ik"><use href="#i-info"/></svg><span><b>Nilai belum pasti.</b> ${esc(t.kurang.join(", "))}. Cek juga laporan lapangan.</span></div>`;
    if (a.slice(-7).some((x) => !x.lengkap)) teks += `<span class="kh-ket">? = data hari itu kurang lengkap</span>`;
    $("khIsi").innerHTML = teks;
    if (t.yakin && t.yakin !== "tinggi") $("khJudul").textContent = JUDUL[r.kode] + "?";
  }
  window.addEventListener("alr:harian", (e) => { kartuHari(e.detail); hariIniKm(e.detail.kmTop); bangunBanner(); });
  if (window.ALR_HARIAN) { kartuHari(window.ALR_HARIAN); hariIniKm(window.ALR_HARIAN.kmTop); }

  // ---------- kotak "Hari ini" ----------
  function hariIniKm(t) {
    if (!t) { $("hiKm").textContent = "Lancar"; return; }
    $("hiKm").innerHTML = `${esc(t.label)}<small>${t.jam} jam</small>`;
  }
  let nTrig = null, nLap = null;
  function hariIniAngka() {
    if (nTrig != null) { $("hiTrig").innerHTML = nTrig ? `${nTrig}<small>titik</small>` : "Aman"; }
    if (nLap != null) { $("hiLap").innerHTML = nLap ? `${nLap}<small>belum selesai</small>` : "0"; }
  }
  window.addEventListener("alr:angka", (e) => { nTrig = e.detail.nTrig; nLap = e.detail.nLap; hariIniAngka(); });

  // ---------- peringatan (kartu dengan tombol Lihat) ----------
  let TRIG = [];
  function peringatan() {
    const el = $("peringatan");
    if (!TRIG.length) { el.innerHTML = `<div class="awas-kartu aman"><span class="aw-gb"><svg class="ik"><use href="#i-jalan"/></svg></span><div><b>Tidak ada jalan merah</b><small>Semua titik ALR jalan normal di data terakhir.</small></div></div>`; return; }
    el.innerHTML = `<div class="ki-kepala"><b>Perlu dicek</b><button type="button" class="ki-link" data-buka-x="trigger">Semua <svg class="ik"><use href="#i-kanan"/></svg></button></div>` +
      TRIG.slice(0, 3).map((t, i) => `<div class="awas-kartu" style="--d:${i * 70}ms"><span class="aw-gb"><svg class="ik"><use href="#i-awas"/></svg></span>
        <div><em>Jalan merah</em><b>STA ${fmtSta(t.sta_awal)}</b><small>${esc((t.alasan || "").split(". ")[0].replace(/(\d)\.(\d)/g, "$1,$2"))}</small></div>
        <button type="button" class="aw-lihat" data-sta="${t.sta_tengah ?? t.sta_awal + 0.1}">Lihat</button></div>`).join("");
    el.querySelectorAll(".aw-lihat").forEach((b) => b.onclick = () => { klik(); window.ALR_penuh?.(true); setTimeout(() => window.ALR_keSta?.(+b.dataset.sta, 17), 120); });
    el.querySelector("[data-buka-x]")?.addEventListener("click", () => { klik(); window.ALR_buka?.("trigger"); });
  }
  let RING = null;
  window.addEventListener("alr:ringkasan", (e) => { RING = e.detail; TRIG = (e.detail.trigger || []).slice().sort((a, b) => (a.speed_terendah ?? 99) - (b.speed_terendah ?? 99)); peringatan(); if (nTrig == null) { nTrig = TRIG.length; hariIniAngka(); } });

  // ---------- banner geser ----------
  const GAMBAR = {
    truk: `<g transform="translate(6 30)"><rect x="0" y="40" width="150" height="10" rx="5" fill="rgba(0,0,0,.25)"/><path d="M8 8h72l10 30H8z" fill="#F2B705"/><path d="M8 8h72l2 6H8z" fill="#FFD54F"/><path d="M22 10l6 26M44 10l6 26" stroke="#C99400" stroke-width="3"/><path d="M90 16h22l14 14v10H90z" fill="#F2B705"/><path d="M96 20h14l9 9H96z" fill="#9AD0F5"/><rect x="4" y="36" width="124" height="7" rx="3" fill="#23282A"/><circle cx="26" cy="44" r="9" fill="#23282A"/><circle cx="26" cy="44" r="4" fill="#9AA3A6"/><circle cx="48" cy="44" r="9" fill="#23282A"/><circle cx="48" cy="44" r="4" fill="#9AA3A6"/><circle cx="110" cy="44" r="9" fill="#23282A"/><circle cx="110" cy="44" r="4" fill="#9AA3A6"/></g>`,
    helm: `<g transform="translate(22 14)"><ellipse cx="60" cy="82" rx="58" ry="9" fill="rgba(0,0,0,.22)"/><path d="M8 66a52 52 0 0 1 104 0z" fill="#F2B705"/><path d="M14 56a46 46 0 0 1 38-38" stroke="#FFE38A" stroke-width="6" stroke-linecap="round" fill="none"/><rect x="48" y="12" width="24" height="54" rx="10" fill="#FFCF33"/><rect x="0" y="64" width="120" height="12" rx="6" fill="#E0A800"/><path d="M96 30l14-10M104 44l16-4" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/></g>`,
    kamera: `<g transform="translate(20 18)"><rect x="0" y="16" width="120" height="76" rx="16" fill="#fff"/><rect x="40" y="4" width="40" height="18" rx="6" fill="#E3ECF8"/><circle cx="60" cy="54" r="27" fill="#16324F"/><circle cx="60" cy="54" r="17" fill="#3B82F6"/><circle cx="53" cy="47" r="6" fill="#fff" opacity=".85"/><circle cx="100" cy="32" r="5" fill="#F2B705"/></g>`,
    rambu: `<g transform="translate(26 8)"><rect x="54" y="60" width="10" height="44" rx="3" fill="#C3C9C3"/><path d="M59 4 116 94H2z" fill="#F2B705" stroke="#23282A" stroke-width="7" stroke-linejoin="round"/><rect x="54" y="34" width="10" height="34" rx="5" fill="#23282A"/><circle cx="59" cy="80" r="6" fill="#23282A"/></g>`,
    ban: `<g transform="translate(30 10)"><circle cx="54" cy="54" r="50" fill="#23282A"/><circle cx="54" cy="54" r="50" fill="none" stroke="#3A4245" stroke-width="10" stroke-dasharray="7 7"/><circle cx="54" cy="54" r="26" fill="#C3C9C3"/><circle cx="54" cy="54" r="9" fill="#6B7478"/></g>`,
  };
  const TEMA = { kuning: ["#F7C531", "#E39A00", "#23282A"], biru: ["#2F7BE5", "#123E8C", "#fff"], hijau: ["#2DBE6C", "#0D6B3A", "#fff"], merah: ["#FF6A4D", "#B3261E", "#fff"] };
  let BANNER_CFG = [], bnIdx = 0, bnJalan = null;
  fetch("banner.json", { cache: "no-cache" }).then((r) => r.ok ? r.json() : null).then((d) => { BANNER_CFG = d?.banner || []; bangunBanner(); }).catch(() => bangunBanner());
  window.addEventListener("alr:rr", () => bangunBanner());
  function bangunBanner() {
    const s = [];
    const H = window.ALR_HARIAN, kt = H?.kmTop;
    if (kt) s.push({ judul: `${kt.label} paling lama berhenti`, isi: `${kt.jam} jam DT berhenti tanggal ${tgl(kt.tanggal).getDate()} ${BULAN[tgl(kt.tanggal).getMonth()]}. Cek titiknya per 200 meter.`, tema: "merah", gambar: "rambu", tombol: "Per 200 m", buka: "km200" });
    BANNER_CFG.forEach((b) => s.push(b));
    const rr = window.ALR_RR;
    if (rr) { const berat = rr.km.filter((k) => k.rr != null).sort((a, b) => b.rr - a.rr)[0];
      s.splice(Math.min(2, s.length), 0, { judul: `RR rata-rata ${koma(rr.rr_rata)}%`, isi: `Jalan hauling terawat biasanya 2 sampai 4%. Paling berat ${berat ? berat.label + " (" + koma(berat.rr) + "%)" : "-"}.`, tema: "hijau", gambar: "ban", tombol: "Lihat RR", buka: "rr" }); }
    if (!s.length) s.push({ judul: "ALR, jalan hauling BSR ke 107", isi: "Pantau kondisi jalan setiap hari.", tema: "kuning", gambar: "truk" });
    const rel = $("bnRel");
    rel.innerHTML = s.map((b, i) => { const [c1, c2, tx] = TEMA[b.tema] || TEMA.kuning;
      return `<article class="bn" style="--c1:${c1};--c2:${c2};--tx:${tx}" aria-roledescription="slide" aria-label="${i + 1} dari ${s.length}">
        <div class="bn-teks"><span class="bn-merek"><img src="ikon/logo_alr.png" alt="">ALR</span><h3>${esc(b.judul)}</h3><p>${esc(b.isi)}</p>
        ${b.buka ? `<button type="button" class="bn-tombol" data-bn="${esc(b.buka)}">${esc(b.tombol || "Lihat")}<svg class="ik"><use href="#i-kanan"/></svg></button>` : ""}</div>
        <svg class="bn-gambar" viewBox="0 0 170 120" aria-hidden="true">${GAMBAR[b.gambar] || GAMBAR.truk}</svg><i class="bn-garis"></i></article>`; }).join("");
    $("bnTitik").innerHTML = s.map((_, i) => `<button type="button" aria-label="Banner ${i + 1}"${i === 0 ? ' class="aktif"' : ""}></button>`).join("");
    $("bnTitik").querySelectorAll("button").forEach((b, i) => b.onclick = () => keBanner(i, true));
    rel.querySelectorAll("[data-bn]").forEach((b) => b.onclick = () => { klik(); const t = b.dataset.bn; if (t === "km200") { window.ALR_setPita?.("200"); window.ALR_buka?.("km"); } else window.ALR_buka?.(t); });
    bnIdx = 0; mulaiBanner();
  }
  function keBanner(i, user) {
    const rel = $("bnRel"), n = rel.children.length; if (!n) return;
    bnIdx = (i + n) % n; rel.scrollTo({ left: rel.children[bnIdx].offsetLeft - rel.offsetLeft, behavior: kurang ? "auto" : "smooth" });
    if (user) mulaiBanner();
  }
  function mulaiBanner() { clearInterval(bnJalan); if (!kurang) bnJalan = setInterval(() => { if (document.visibilityState === "visible" && !document.body.classList.contains("ada-lyr")) keBanner(bnIdx + 1); }, 5500); }
  $("bnRel").addEventListener("scroll", () => {
    const rel = $("bnRel"), i = Math.round(rel.scrollLeft / Math.max(1, rel.clientWidth));
    $("bnTitik").querySelectorAll("button").forEach((b, j) => b.classList.toggle("aktif", j === i)); bnIdx = i;
  }, { passive: true });
  $("bnRel").addEventListener("pointerdown", () => mulaiBanner());

  // ---------- menu bawah ----------
  const NAMA_TAB = { peta: "peta", kotak: "kotak", forum: "forum", profil: "akun" };
  function tandaiTab(lyr) {
    const t = lyr == null ? "beranda" : NAMA_TAB[lyr] || "";
    document.querySelectorAll("#tabbar [data-tab]").forEach((b) => b.classList.toggle("aktif", b.dataset.tab === t));
  }
  window.addEventListener("alr:layar", (e) => { tandaiTab(e.detail.aktif); if (e.detail.aktif === "kotak") bacaKotak(); });
  function pergi(t) {
    const peta = document.body.classList.contains("peta-penuh"), adaLyr = document.body.classList.contains("ada-lyr");
    if (t === "beranda") { if (peta) window.ALR_penuh(false); window.ALR_tutupSemua(); window.scrollTo({ top: 0, behavior: "smooth" }); tandaiTab(null); return; }
    if (t === "peta") { window.ALR_tutupSemua(); setTimeout(() => { if (!document.body.classList.contains("peta-penuh")) window.ALR_penuh(true); }, adaLyr ? 330 : 0); return; }
    if (peta) window.ALR_penuh(false);
    setTimeout(() => window.ALR_buka?.(t === "akun" ? "profil" : t), peta ? 120 : 0);
  }
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { klik(); pergi(b.dataset.tab); }));
  $("btnLonceng").onclick = () => { klik(); pergi("kotak"); };

  // ---------- kotak masuk ----------
  const KK = "alr_kotak", KB = "alr_kotak_baca";
  let kotak = simpan.get(KK, null), baca = simpan.get(KB, 0);
  if (kotak === null) { kotak = []; baca = Date.now() + 60000; simpan.set(KB, baca); }   // pertama kali: yang lama dianggap sudah dibaca
  window.addEventListener("alr:daftar", (e) => {
    const ada = new Set(kotak.map((x) => x.kunci)), now = Date.now();
    e.detail.forEach((x) => { if (!ada.has(x.kunci)) kotak.unshift({ kunci: x.kunci, judul: x.judul, isi: x.isi, layar: x.layar, t: now }); });
    kotak = kotak.slice(0, 80); simpan.set(KK, kotak); angkaKotak();
    if (document.querySelector("#lyr-kotak.tampil")) gambarKotak();
  });
  function angkaKotak() {
    const n = kotak.filter((x) => x.t > baca).length;
    [$("nKotak"), $("nKotakAtas")].forEach((b) => { b.hidden = !n; b.textContent = n > 9 ? "9+" : n; });
  }
  const lalu = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "baru saja" : m < 60 ? `${m} mnt lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`; };
  function gambarKotak() {
    const el = $("listKotak");
    el.innerHTML = kotak.length ? kotak.map((x, i) => `<button type="button" class="kotak-baris${x.t > baca ? " baru" : ""}" data-i="${i}">
      <span class="kt-gb ${x.layar === "laporan" ? "biru" : "merah"}"><svg class="ik"><use href="#i-${x.layar === "laporan" ? "kamera" : "awas"}"/></svg></span>
      <div><b>${esc(x.judul.replace(/^ALR:\s*/, ""))}</b><small>${esc(x.isi || "")}</small><em>${lalu(x.t)}</em></div><svg class="ik kt-panah"><use href="#i-kanan"/></svg></button>`).join("")
      : `<div class="kosong-besar"><span class="kb-gb" data-ikon="laporan">${window.ALR_ikon3d?.("laporan") || ""}</span><h3>Belum ada pesan</h3><p>Pemberitahuan jalan merah dan laporan lapangan akan muncul di sini.</p></div>`;
    el.querySelectorAll(".kotak-baris").forEach((b) => b.onclick = () => { klik(); window.ALR_buka?.(kotak[+b.dataset.i].layar); });
  }
  function bacaKotak() { gambarKotak(); baca = Date.now(); simpan.set(KB, baca); setTimeout(angkaKotak, 600); }
  angkaKotak();

  // ---------- cari ----------
  const MENU = [
    { n: "Trigger jalan merah", b: "trigger" }, { n: "Jalan per KM", b: "km" }, { n: "Per 200 meter, titik berhenti", b: "km", p: "200" },
    { n: "RR dan traksi, rawan selip", b: "rr" }, { n: "Hujan di jalan, cuaca", b: "hujan" }, { n: "Nilai jalan dan grafik", b: "grafik" },
    { n: "Laporan lapangan, foto", b: "laporan" }, { n: "Database laporan, Supabase, Excel", b: "database" }, { n: "Pengguna dan ID card", b: "pengguna" }, { n: "Kotak masuk, pesan", t: "kotak" },
    { n: "Forum", t: "forum" }, { n: "Akun, notifikasi, suara", t: "akun" }, { n: "Peta layar penuh", t: "peta" }];
  const inp = $("cariInput"), hasil = $("cariHasil");
  function bukaKm(km) {
    window.ALR_setPita?.("km"); window.ALR_buka?.("km");
    let n = 0; const coba = () => { const r = document.querySelector(`#strip rect.kotak-km[data-km="${km}"]`); if (r && window.ALR_KM_DATA) r.dispatchEvent(new MouseEvent("click", { bubbles: true })); else if (n++ < 20) setTimeout(coba, 200); };
    setTimeout(coba, 450);
  }
  inp.addEventListener("input", () => {
    const q = inp.value.trim().toLowerCase(); if (!q) { hasil.hidden = true; return; }
    const out = [], angka = q.match(/\d+([.,+]\d+)?/);
    if (angka) {
      const v = parseFloat(angka[0].replace(",", ".").replace("+", ".")), km = Math.floor(v);
      if (km >= 0 && km < 29) {
        out.push({ teks: `<b>KM ${km}-${km + 1}</b><small>Jam berhenti, kecepatan, dan rincian per 200 meter</small>`, aksi: () => bukaKm(km) });
        out.push({ teks: `<b>STA ${fmtSta(v)} di peta</b><small>Tunjukkan titiknya di peta layar penuh</small>`, aksi: () => { window.ALR_penuh?.(true); setTimeout(() => window.ALR_keSta?.(angka[0].includes(".") || angka[0].includes(",") || angka[0].includes("+") ? v : km + 0.5, 16), 150); } });
      }
    }
    MENU.filter((m) => q.split(/\s+/).every((w) => m.n.toLowerCase().includes(w))).forEach((m) => out.push({ teks: `<b>${esc(m.n.split(",")[0])}</b><small>Buka menu</small>`, aksi: () => m.t ? pergi(m.t) : (window.ALR_setPita?.(m.p || "km"), window.ALR_buka?.(m.b)) }));
    hasil.innerHTML = out.length ? out.slice(0, 6).map((o, i) => `<button type="button" data-i="${i}"><svg class="ik"><use href="#i-${i < 2 && angka ? "lokasi" : "cari"}"/></svg><span>${o.teks}</span></button>`).join("")
      : `<p class="cari-kosong">Tidak ketemu. Coba ketik nomor KM, misalnya 16.</p>`;
    hasil.querySelectorAll("button").forEach((b) => b.onclick = () => { klik(); hasil.hidden = true; inp.value = ""; inp.blur(); out[+b.dataset.i].aksi(); });
    hasil.hidden = false;
  });
  inp.addEventListener("blur", () => setTimeout(() => hasil.hidden = true, 200));
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") hasil.querySelector("button")?.click(); });

  // ---------- tekan = sedikit mengecil (rasa aplikasi) ----------
  document.addEventListener("pointerdown", (e) => { const b = e.target.closest(".mi, .hi, .bn-tombol, .aw-lihat, .kh-lihat, .tabbar button, .hero-btn, .kotak-baris"); if (!b) return; b.classList.add("ditekan"); const lepas = () => { b.classList.remove("ditekan"); removeEventListener("pointerup", lepas); removeEventListener("pointercancel", lepas); }; addEventListener("pointerup", lepas); addEventListener("pointercancel", lepas); });
  document.body.classList.add("ada-tab");

  // ---------- mode terang / gelap ----------
  const html = document.documentElement, mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  let pilihTema = simpan.get("alr_tema", "otomatis");
  function pasangTema() {
    const g = pilihTema === "gelap" || (pilihTema === "otomatis" && mq?.matches);
    html.setAttribute("data-tema", g ? "gelap" : "terang");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", g ? "#071B3A" : "#0B4EA2");
    $("btnTema").innerHTML = `<svg class="ik"><use href="#i-${g ? "matahari" : "bulan"}"/></svg>`;
    document.querySelectorAll(".pilih-tema [data-tema]").forEach((b) => b.classList.toggle("aktif", b.dataset.tema === pilihTema));
    window.dispatchEvent(new CustomEvent("alr:tema", { detail: { gelap: g } }));
  }
  function setTema(p) { pilihTema = p; simpan.set("alr_tema", p); html.classList.add("ganti-tema"); pasangTema(); setTimeout(() => html.classList.remove("ganti-tema"), 450); }
  $("btnTema").onclick = () => { klik(); setTema(html.getAttribute("data-tema") === "gelap" ? "terang" : "gelap"); };
  document.querySelectorAll(".pilih-tema [data-tema]").forEach((b) => b.onclick = () => { klik(); setTema(b.dataset.tema); });
  mq?.addEventListener?.("change", () => pilihTema === "otomatis" && pasangTema());
  pasangTema();

  // ---------- layar dalam: ikon 3D di judul + kartu pembuka berwarna ----------
  const LYR = {
    trigger: { ikon: "trigger", warna: "merah", judul: "Jalan merah yang perlu dicek", isi: () => nTrig != null ? (nTrig ? `${nTrig} titik terbuka. Pencet kartu untuk lihat di peta.` : "Semua aman, tidak ada jalan merah.") : "Memuat..." },
    laporan: { ikon: "laporan", warna: "merah", judul: "Laporan dari lapangan", isi: () => nLap ? `${nLap} laporan belum selesai.` : "Foto dan video kondisi jalan dari pengawas." },
    km: { ikon: "km", warna: "biru", judul: "Di mana DT berhenti", isi: () => { const t = window.ALR_HARIAN?.kmTop; return t ? `Terakhir paling lama di ${t.label}, ${t.jam} jam.` : "Per 1 KM atau per 200 meter."; } },
    rr: { ikon: "rr", warna: "biru", judul: "Berat jalan & rawan selip", isi: () => window.ALR_RR ? `RR rata-rata ${koma(window.ALR_RR.rr_rata)}%. Jalan terawat 2 sampai 4%.` : "Perkiraan dari kecepatan DT bermuatan." },
    hujan: { ikon: "hujan", warna: "langit", judul: "Hujan di jalan ALR", isi: () => $("subHujan")?.textContent && $("subHujan").textContent !== "-" ? $("subHujan").textContent : "Cuaca per section jalan." },
    grafik: { ikon: "grafik", warna: "biru", judul: "Nilai jalan", isi: () => { const h = window.ALR_HARIAN?.hari; const t = h?.[h.length - 1]; return t ? `Nilai terakhir ${t.r.nilai} dari 100, ${JUDUL[t.r.kode].toLowerCase()}.` : "Nilai 0 sampai 100 dari kerja DT."; } },
    profil: { ikon: "pengguna", warna: "biru", judul: "Akun & pengaturan", isi: () => "Nama kamu, notifikasi, suara, dan mode layar." },
    kotak: { ikon: "laporan", warna: "biru", judul: "Kotak masuk", isi: () => "Semua pemberitahuan ALR ada di sini." },
    forum: { ikon: "forum", warna: "merah", judul: "Forum tim ALR", isi: () => "Segera hadir." },
  };
  Object.entries(LYR).forEach(([n, c]) => {
    const l = $("lyr-" + n); if (!l) return;
    const g = l.querySelector(".lyr-gb"); if (g && window.ALR_ikon3d) { const i = window.ALR_ikon3d(c.ikon); if (i) { g.innerHTML = i; g.classList.add("gb3d"); } }
    const badan = l.querySelector(".lyr-badan"); if (!badan || n === "forum") return;
    const h = document.createElement("div"); h.className = `lyr-hero lh-${c.warna}`;
    h.innerHTML = `<div class="lh-teks"><b>${c.judul}</b><span class="lh-isi"></span></div><span class="lh-ikon">${window.ALR_ikon3d?.(c.ikon) || ""}</span><i class="lh-pita"></i>`;
    badan.prepend(h);
  });
  window.addEventListener("alr:layar", (e) => { const c = LYR[e.detail.aktif], l = $("lyr-" + e.detail.aktif); if (c && l) { const s = l.querySelector(".lh-isi"); if (s) s.textContent = c.isi(); } });
})();
