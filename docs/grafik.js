// Halaman Kondisi Jalan ALR: nilai kondisi jalan dari performa DT, filter rentang tanggal, per hari/minggu/bulan
(function () {
  const $ = (id) => document.getElementById(id);
  const WARNA = { LAYAK: "#2E7D32", KURANG: "#D98200", TIDAK: "#C8321F", KOSONG: "#DDE1DA" };
  const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const BIRU = "#2A2F2B";
  let KM = null,
  HARI = new Map(), KL = {}, TELAT = 195, mode = "hari", grafik = {}, awalData, akhirData;

  if (window.Chart) { Chart.defaults.font.family = "Barlow, system-ui, sans-serif"; Chart.defaults.font.size = 14; Chart.defaults.color = "#3E4541"; }
  // ---------- util ----------
  const tgl = (s) => new Date(s + "T00:00:00");
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const tambah = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fmt = (d) => `${d.getDate()} ${BULAN[d.getMonth()]}`;
  const fmtPanjang = (d) => `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
  const senin = (d) => tambah(d, -((d.getDay() + 6) % 7));
  const jamMenit = (m) => { if (m == null) return "-"; m = Math.round(m); const j = Math.floor(m / 60), s = m % 60; return j ? `${j} jam${s ? " " + s + " mnt" : ""}` : `${s} mnt`; };
  const rata = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const rataBobot = (a, w) => { let s = 0, n = 0; a.forEach((x, i) => { if (x != null && w[i]) { s += x * w[i]; n += w[i]; } }); return n ? s / n : rata(a); };
  const kodeStatus = (i) => i == null ? "KOSONG" : i >= (KL.batas_layak ?? 75) ? "LAYAK" : i >= (KL.batas_perhatian ?? 50) ? "KURANG" : "TIDAK";
  const NAMA = { LAYAK: "Kondisi baik", KURANG: "Perlu perhatian", TIDAK: "Perlu perbaikan", KOSONG: "Tidak ada data" };
  const JUDUL = { LAYAK: "Jalan ALR dalam kondisi baik", KURANG: "Jalan ALR perlu perhatian", TIDAK: "Jalan ALR perlu perbaikan", KOSONG: "Belum ada data jalan ALR" };
  const IKON = { LAYAK: "✅", KURANG: "⚠️", TIDAK: "⛔", KOSONG: "📭" };

  // ringkas sekumpulan hari (yang ada datanya) jadi satu angka per ukuran
  function ringkas(hari) {
    const a = hari.filter(Boolean);
    if (!a.length) return null;
    const nt = a.map((x) => x.n_trip), rit = nt.reduce((s, x) => s + (x || 0), 0), telat = a.reduce((s, x) => s + (x.n_lambat || 0), 0);
    const nilai = rata(a.map((x) => x.indeks));
    return { hariData: a.length, rit: rit || null, waktu: rataBobot(a.map((x) => x.median_menit), nt), pctTelat: rit ? telat / rit * 100 : null,
      kosong: rataBobot(a.map((x) => x.kosong_menit), nt), muatBsr: rataBobot(a.map((x) => x.muat_bsr_menit), nt),
      bongkar: rataBobot(a.map((x) => x.bongkar_107_menit), nt),
      speed: rata(a.map((x) => x.gps_speed)), berhenti: rata(a.map((x) => x.gps_pct_berhenti)), nilai: nilai == null ? null : Math.round(nilai), kode: kodeStatus(nilai) };
  }

  // ---------- rentang ----------
  function rentang() { return [tgl($("dari").value), tgl($("sampai").value)]; }
  function setRentang(dari, sampai) {
    $("dari").value = iso(dari < awalData ? awalData : dari); $("sampai").value = iso(sampai);
    gambar();
  }
  document.querySelectorAll("[data-p]").forEach((b) => b.onclick = () => {
    document.querySelectorAll("[data-p]").forEach((x) => x.classList.toggle("aktif", x === b));
    const p = b.dataset.p;
    setRentang(p === "semua" ? awalData : tambah(akhirData, -(+p - 1)), akhirData);
  });
  ["dari", "sampai"].forEach((id) => $(id).onchange = () => { document.querySelectorAll("[data-p]").forEach((x) => x.classList.remove("aktif")); gambar(); });
  document.querySelectorAll("[data-m]").forEach((b) => b.onclick = () => {
    document.querySelectorAll("[data-m]").forEach((x) => x.classList.toggle("aktif", x === b));
    mode = b.dataset.m; gambar();
  });

  // ---------- periode (hari/minggu/bulan), tanggal tanpa data tetap ditampilkan ----------
  function periode(dari, sampai) {
    const out = [], peta = new Map();
    for (let d = new Date(dari); d <= sampai; d = tambah(d, 1)) {
      const k = mode === "hari" ? iso(d) : mode === "minggu" ? iso(senin(d)) : iso(d).slice(0, 7);
      if (!peta.has(k)) {
        let label, judul;
        if (mode === "hari") { label = fmt(d); judul = d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
        else if (mode === "minggu") { const s = senin(d); label = fmt(s); judul = `${fmt(s)} - ${fmtPanjang(tambah(s, 6))}`; }
        else { label = `${BULAN[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`; judul = `${BULAN[d.getMonth()]} ${d.getFullYear()}`; }
        peta.set(k, { label, judul, hari: [], tgl: [] }); out.push(peta.get(k));
      }
      peta.get(k).hari.push(HARI.get(iso(d)) || null); peta.get(k).tgl.push(iso(d));
    }
    return out.map((p) => ({ ...p, r: ringkas(p.hari) }));
  }

  function rentangKosong(dari, sampai) {
    const hasil = []; let mulai = null;
    for (let d = new Date(dari); d <= tambah(sampai, 1); d = tambah(d, 1)) {
      const kosong = d <= sampai && !HARI.has(iso(d));
      if (kosong && !mulai) mulai = new Date(d);
      if (!kosong && mulai) { const akhir = tambah(d, -1), n = Math.round((akhir - mulai) / 864e5) + 1; hasil.push(n === 1 ? `${fmt(mulai)}` : `${fmt(mulai)} - ${fmt(akhir)} (${n} hari)`); mulai = null; }
    }
    return hasil;
  }

  // ---------- grafik ----------
  function opsi(satuan, extra = {}) {
    return { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (c) => c[0] && c[0].chart.$judul[c[0].dataIndex],
        label: (c) => c.dataset.label === "Target" ? ` Target: ${c.parsed.y} ${satuan}` : c.parsed.y == null ? " Tidak ada data" : ` ${c.dataset.label}: ${c.parsed.y} ${satuan}` } } },
      scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 14, color: "#64748b" } },
        y: { beginAtZero: true, grid: { color: "#eef2f6" }, border: { display: false }, ticks: { color: "#64748b" }, ...extra } } };
  }
  function buat(id, data, o, judul) { grafik[id]?.destroy(); grafik[id] = new Chart($(id), { data, options: o }); grafik[id].$judul = judul; }
  const target = (n, v) => ({ type: "line", label: "Target", data: Array(n).fill(v), borderColor: "#94a3b8", borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, pointHitRadius: 0 });
  const batang = (label, data, warna) => ({ type: "bar", label, data, backgroundColor: warna, borderRadius: 4, borderSkipped: "start", maxBarThickness: 32 });
  const garis = (label, data) => ({ type: "line", label, data, borderColor: BIRU, backgroundColor: BIRU, borderWidth: 2, pointRadius: 3, pointHoverRadius: 6, spanGaps: false, tension: 0.2 });
  const s1 = (x) => x == null ? null : Math.round(x * 10) / 10;

  function gambar() {
    let [dari, sampai] = rentang();
    if (isNaN(dari) || isNaN(sampai)) return;
    if (dari > sampai) [dari, sampai] = [sampai, dari];
    const P = periode(dari, sampai), L = P.map((p) => p.label), J = P.map((p) => p.judul), n = P.length;

    const o = opsi("", { max: 100 });
    o.plugins.tooltip.callbacks.label = (c) => { const r = P[c.dataIndex].r; return r ? ` Nilai ${r.nilai}, ${NAMA[r.kode].toLowerCase()}` : " Tidak ada data (belum diupload)"; };
    buat("cNilai", { labels: L, datasets: [batang("Nilai", P.map((p) => p.r ? p.r.nilai : 100), P.map((p) => WARNA[p.r ? p.r.kode : "KOSONG"])),
      target(n, KL.batas_layak ?? 75)] }, o, J);
    const TAHAP = [["Kosongan 107 → BSR", "kosong", "#2a78d6"], ["Antre & muat di BSR", "muatBsr", "#eb6834"],
                   ["Muatan BSR → 107", "waktu", "#1baf7a"], ["Bongkar di 107", "bongkar", "#eda100"]];
    const adaTahap = TAHAP.filter(([, k]) => P.some((p) => p.r && p.r[k] != null));
    const oS = opsi("jam"); oS.scales.x.stacked = oS.scales.y.stacked = true;
    oS.plugins.legend = { display: true, position: "top", align: "start", labels: { boxWidth: 12, boxHeight: 12, color: "#334155" } };
    oS.plugins.tooltip.callbacks.label = (c) => c.parsed.y == null ? null : ` ${c.dataset.label}: ${jamMenit(c.parsed.y * 60)}`;
    oS.plugins.tooltip.callbacks.footer = (items) => { const t = items.reduce((s, i) => s + (i.parsed.y || 0), 0); return t ? `Total 1 rit: ${jamMenit(t * 60)}` : "Tidak ada data"; };
    buat("cSiklus", { labels: L, datasets: adaTahap.map(([nama, k, w]) => ({ type: "bar", label: nama, data: P.map((p) => p.r && p.r[k] != null ? s1(p.r[k] / 60) : null),
      backgroundColor: w, borderColor: "#ffffff", borderWidth: { top: 2 }, borderSkipped: false, maxBarThickness: 34 })) }, oS, J);
    const hilang = TAHAP.filter((t) => !adaTahap.includes(t)).map(([nama]) => nama.toLowerCase());
    $("infoSiklus").hidden = !hilang.length;
    $("infoSiklus").innerHTML = hilang.length ? `ℹ️ Waktu ${hilang.join(" dan ")} belum bisa dihitung: jam keluar/masuk di data trip belum terbaca.` : "";
    const oW = opsi("jam"); oW.plugins.legend = { display: true, position: "top", align: "start", labels: { boxWidth: 12, boxHeight: 12, color: "#334155", filter: (i) => i.text !== "Target" } };
    oW.plugins.tooltip.callbacks.label = (c) => c.parsed.y == null ? null : c.dataset.label === "Target" ? ` Target muatan: ${jamMenit(c.parsed.y * 60)}` : ` ${c.dataset.label}: ${jamMenit(c.parsed.y * 60)}`;
    const wr = (lbl, k, w) => ({ ...garis(lbl, P.map((p) => p.r && p.r[k] != null ? s1(p.r[k] / 60) : null)), borderColor: w, backgroundColor: w });
    buat("cWaktu", { labels: L, datasets: [wr("Muatan BSR → 107", "waktu", "#1baf7a"), wr("Kosongan 107 → BSR", "kosong", "#2a78d6"), target(n, s1((KL.durasi_bagus_menit ?? 120) / 60))] }, oW, J);
    buat("cTelat", { labels: L, datasets: [batang("Rit telat", P.map((p) => p.r && s1(p.r.pctTelat)), BIRU)] }, opsi("%"), J);
    buat("cRit", { labels: L, datasets: [batang("Jumlah rit", P.map((p) => p.r && p.r.rit), BIRU)] }, opsi("rit"), J);
    buat("cSpeed", { labels: L, datasets: [garis("Kecepatan", P.map((p) => p.r && s1(p.r.speed))), target(n, KL.speed_bagus_kmh ?? 20)] }, opsi("km/jam"), J);

    const kosong = rentangKosong(dari, sampai);
    $("infoKosong").hidden = !kosong.length;
    $("infoKosong").innerHTML = kosong.length ? `📭 <b>Kenapa ada yang kosong?</b> Tanggal ini belum ada data yang diupload: ${kosong.join(", ")}.` : "";

    // ringkasan seluruh rentang + banding dengan rentang sebelumnya yang sama panjang
    const semua = [], sebelum = [], panjang = Math.round((sampai - dari) / 864e5) + 1;
    for (let d = new Date(dari); d <= sampai; d = tambah(d, 1)) semua.push(HARI.get(iso(d)));
    for (let d = tambah(dari, -panjang); d < dari; d = tambah(d, 1)) sebelum.push(HARI.get(iso(d)));
    status(ringkas(semua), ringkas(sebelum), dari, sampai, panjang);
    if (KM) perKm(dari, sampai);
    tabel(P);
  }

  // ---------- per kilometer ----------
  let ARAH = "semua", RENTANG = null;
  const NAMA_ARAH = { semua: "", muatan: " (arah muatan BSR → 107)", kosongan: " (arah kosongan 107 → BSR)" };
  const sumber = (a) => a === "semua" || !KM.arah ? KM.hari : KM.arah[a];
  function jumlah(src, dari, sampai) {
    const tot = KM.km.map(() => [0, 0, 0, 0, 0, new Set()]);
    for (let d = new Date(dari); d <= sampai; d = tambah(d, 1)) {
      const h = src[iso(d)]; if (!h) continue;
      for (const k in h) { const t = tot[k], v = h[k]; for (let i = 0; i < 5; i++) t[i] += v[i]; v[5].forEach((u) => t[5].add(u)); }
    }
    return tot;
  }
  document.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => {
    ARAH = b.dataset.a;
    document.querySelectorAll("[data-a]").forEach((x) => x.classList.toggle("aktif", x === b));
    if (KM && RENTANG) perKm(...RENTANG);
  });

  function perKm(dari, sampai) {
    RENTANG = [dari, sampai];
    const daftar = KM.km, n = daftar.length, tot = jumlah(sumber(ARAH), dari, sampai);
    const totSemua = jumlah(KM.hari, dari, sampai);
    const totM = KM.arah ? jumlah(KM.arah.muatan, dari, sampai) : null, totK = KM.arah ? jumlah(KM.arah.kosongan, dari, sampai) : null;
    const semuaUrut = [...daftar].reverse();                     // BSR (KM 26-27) di kiri, 107 di kanan = arah muatan
    const urut = semuaUrut.filter((k) => !k.zona);                // zona antre/parkir tidak digambar di grafik (bukan masalah jalan)
    const zonaJam = {};
    semuaUrut.filter((k) => k.zona).forEach((k) => { const t = totSemua[k.km]; zonaJam[k.zona] = (zonaJam[k.zona] || 0) + t[1] + t[2]; });
    for (let d = new Date(dari); d <= sampai; d = tambah(d, 1)) { const z = KM.zona_hari?.[iso(d)]; if (z) for (const n in z) { const nm = n.replace(/ \(STA.*\)$/, ""); zonaJam[nm] = (zonaJam[nm] || 0) + z[n]; } }
    const L = urut.map((k) => k.label + (k.zona ? "*" : "")), T = urut.map((k) => tot[k.km]);
    const speed = T.map((t) => t[4] ? s1(t[3] / t[4]) : null);
    const oA = opsi("jam"); oA.scales.x.stacked = oA.scales.y.stacked = true; oA.scales.x.ticks.autoSkip = false; oA.scales.x.ticks.maxRotation = 60;
    oA.plugins.legend = { display: true, position: "top", align: "start", labels: { boxWidth: 12, boxHeight: 12, color: "#334155" } };
    oA.plugins.tooltip.callbacks.title = (c) => `${urut[c[0].dataIndex].label}${urut[c[0].dataIndex].zona ? " · " + urut[c[0].dataIndex].zona : ""}`;
    oA.plugins.tooltip.callbacks.footer = (c) => { const t = T[c[0].dataIndex]; return `${t[5].size} unit lewat · ${t[0]} titik GPS`; };
    buat("cKmStop", { labels: L, datasets: [
      { type: "bar", label: "Berhenti mesin hidup", data: T.map((t) => t[1]), backgroundColor: "#eb6834", borderColor: "#fff", borderWidth: { top: 2 }, borderSkipped: false },
      { type: "bar", label: "Berhenti mesin mati", data: T.map((t) => t[2]), backgroundColor: "#2a78d6", borderColor: "#fff", borderWidth: { top: 2 }, borderSkipped: false }] }, oA, L);
    const oB = opsi("km/jam"); oB.scales.x.ticks.autoSkip = false; oB.scales.x.ticks.maxRotation = 60;
    oB.plugins.tooltip.callbacks.title = (c) => urut[c[0].dataIndex].label;
    oB.plugins.tooltip.callbacks.label = (c) => c.parsed.y == null ? " Tidak ada data" : ` Kecepatan ${c.parsed.y} km/jam · ${c.parsed.y <= 13 ? "lambat" : c.parsed.y <= 17 ? "agak pelan" : "lancar"}`;
    buat("cKmSpeed", { labels: L, datasets: [batang("Kecepatan", speed, speed.map((v) => v == null ? "#e5e7eb" : v <= 13 ? WARNA.TIDAK : v <= 17 ? WARNA.KURANG : WARNA.LAYAK)),
      target(n, KL.speed_bagus_kmh ?? 20)] }, oB, L);

    strip(semuaUrut, totM, totK, totSemua);
    document.querySelectorAll(".nArah").forEach((e) => e.textContent = NAMA_ARAH[ARAH]);
    // KM paling bermasalah (bukan zona antre/parkir)
    const skor = daftar.filter((k) => !k.zona).map((k) => { const t = totSemua[k.km]; return { k, jam: t[1] + t[2], hidup: t[1], sp: t[4] ? t[3] / t[4] : null, unit: t[5].size,
        m: totM ? totM[k.km][1] + totM[k.km][2] : null, ks: totK ? totK[k.km][1] + totK[k.km][2] : null }; })
      .filter((x) => x.jam > 0 || (x.sp != null && x.sp <= 13)).sort((a, b) => b.jam - a.jam).slice(0, 5);
    $("topKm").innerHTML = skor.length ? `<div class="top">${skor.map((x, i) => `<div class="it"><div class="rambu"><svg viewBox="0 0 38 34" aria-hidden="true"><path d="M19 2 36 32H2z" fill="#F2B705" stroke="#23282A" stroke-width="2.5" stroke-linejoin="round"/><path d="M19 12v9M19 25v1" stroke="#23282A" stroke-width="3.5" stroke-linecap="round"/></svg><b class="km">${x.k.label}</b></div>
        <b>${x.jam} jam</b> unit tertahan, ${x.hidup} jam di antaranya mesin hidup.${x.m != null ? `<br>Arah muatan ${x.m} jam, arah kosongan ${x.ks} jam.` : ""}<br>Kecepatan ${x.sp != null ? Math.round(x.sp) + " km/jam" : "belum ada data"}, ${x.unit} unit lewat.</div>`).join("")}</div>`
      : `<p style="color:#C3C9C3;font-size:17px">Tidak ada KM bermasalah di rentang tanggal ini.</p>`;
    const zt = Object.entries(zonaJam).filter(([, v]) => v);
    if (zt.length) $("topKm").innerHTML += `<div class="kosong-info">Tidak dihitung karena bukan masalah jalan: ${zt.map(([z, v]) => `${z.toLowerCase()} ${v} jam`).join(", ")}.</div>`;

    // tabel warna KM x periode
    const P = periode(dari, sampai);
    const per = [];  // per periode: jam tertahan per km
    for (const p of P) {
      const a = Array(n).fill(null);
      p.tgl.forEach((t) => { const h = sumber(ARAH)[t]; if (!h) return; for (const k in h) a[k] = (a[k] || 0) + h[k][1] + h[k][2]; });
      per.push(a);
    }
    const maks = Math.max(1, ...per.flatMap((a) => urut.map((k) => a[k.km] || 0)));
    const warna = (v) => { if (!v) return "#F1F3EF"; const x = Math.min(1, v / Math.max(6, maks * 0.6)); return `rgba(200,50,31,${0.12 + 0.8 * x})`; };
    $("heat").innerHTML = `<table class="heat"><thead><tr><th></th>${P.map((p) => `<th>${p.label}</th>`).join("")}</tr></thead><tbody>` +
      semuaUrut.map((k) => `<tr><th>${k.label}${k.zona ? "*" : ""}</th>${per.map((a, i) => { const v = a[k.km];
        return `<td style="background:${k.zona ? (v ? "#DDE1DA" : "#F1F3EF") : warna(v)};color:${!k.zona && v && v / maks > 0.5 ? "#fff" : "#111"}" title="${k.label} · ${P[i].judul}: ${v ? v + " jam unit tertahan" : "tidak ada"}">${v || ""}</td>`; }).join("")}</tr>`).join("") + `</tbody></table>`;
  }

  // pita jalur BSR (kiri) -> 107 (kanan), dua lajur: atas muatan (BSR -> 107), bawah kosongan (107 -> BSR)
  function strip(urut, totM, totK, totSemua) {
    const n = urut.length, x0 = 44, x1 = 956, w = (x1 - x0) / n, hgt = 26;
    const lajur = totM ? [{ tot: totM, y: 38, nama: "Muatan", ke: 1 }, { tot: totK, y: 38 + hgt + 6, nama: "Kosongan", ke: -1 }] : [{ tot: totSemua, y: 38, nama: "Semua", ke: 1 }];
    const jamOf = (t, k) => k.zona ? 0 : t[k.km][1] + t[k.km][2];
    const maks = Math.max(4, ...lajur.flatMap((l) => urut.map((k) => jamOf(l.tot, k))));
    const isi = (k, j) => k.zona ? "url(#arsir)" : !j ? "#3B413C" : `rgba(242,${Math.round(183 - 150 * Math.min(1, j / maks))},${Math.round(5 + 26 * Math.min(1, j / maks))},${0.35 + 0.65 * Math.min(1, j / maks)})`;
    let g = `<defs><pattern id="arsir" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#3B413C"/><line x1="0" y1="0" x2="0" y2="6" stroke="#6B726C" stroke-width="2"/></pattern>
      <marker id="panah" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#B8BFB7"/></marker></defs>`;
    const yb = lajur[lajur.length - 1].y + hgt;                     // bawah jalan
    lajur.forEach((l) => urut.forEach((k, i) => {
      const x = x0 + i * w, j = jamOf(l.tot, k);
      g += `<rect x="${x + 1}" y="${l.y}" width="${w - 2}" height="${hgt}" rx="2" fill="${isi(k, j)}"><title>${k.label}, arah ${l.nama.toLowerCase()}${k.zona ? ", " + k.zona.toLowerCase() : ""}: ${k.zona ? "tidak dihitung" : j + " jam unit tertahan"}</title></rect>`;
      if (!k.zona && j >= maks * 0.45) g += `<text x="${x + w / 2}" y="${l.y + hgt / 2 + 5}" text-anchor="middle" font-size="13" font-weight="700" fill="#1E2320" pointer-events="none">${j}</text>`;
    }));
    if (lajur.length > 1) g += `<line x1="${x0}" y1="${38 + hgt + 3}" x2="${x1}" y2="${38 + hgt + 3}" stroke="#F2B705" stroke-width="2" stroke-dasharray="12 8"/>`;
    urut.forEach((k, i) => {
      const x = x0 + i * w, sta = k.km + 1;
      g += `<line x1="${x}" y1="${yb + 4}" x2="${x}" y2="${yb + (sta % 5 === 0 || i === 0 ? 14 : 9)}" stroke="#B8BFB7" stroke-width="1.5"/>`;
      if (sta % 5 === 0 || i === 0) g += `<text x="${x}" y="${yb + 28}" text-anchor="middle" font-size="13" fill="#D7DCD5">STA ${sta}</text>`;
    });
    g += `<text x="${x1}" y="${yb + 28}" text-anchor="middle" font-size="13" fill="#D7DCD5">STA 0</text>`;
    const ym = (lajur[0].y + yb) / 2;
    g += `<text x="${x0 - 8}" y="${ym + 6}" text-anchor="end" font-size="17" font-weight="700" fill="#F2B705">BSR</text>`;
    g += `<text x="${x1 + 8}" y="${ym + 6}" font-size="17" font-weight="700" fill="#F2B705">107</text>`;
    g += `<text x="${x0}" y="22" font-size="13" fill="#B8BFB7">${lajur.length > 1 ? "Lajur atas: muatan" : "Arah muatan"}</text><line x1="${x0 + 118}" y1="18" x2="${x0 + 180}" y2="18" stroke="#B8BFB7" stroke-width="1.5" marker-end="url(#panah)"/>`;
    if (lajur.length > 1) g += `<line x1="${x1 - 168}" y1="18" x2="${x1 - 230}" y2="18" stroke="#B8BFB7" stroke-width="1.5" marker-end="url(#panah)"/><text x="${x1}" y="22" text-anchor="end" font-size="13" fill="#B8BFB7">Lajur bawah: kosongan</text>`;
    $("strip").setAttribute("viewBox", `0 0 1000 ${yb + 36}`);
    $("strip").innerHTML = g;
  }

  const ik = (n) => `<svg class="ik"><use href="#i-${n}"/></svg>`;
  function banding(a, b, satuan, naikBaik, f = (x) => s1(x)) {
    if (a == null || b == null) return `<span class="netral">belum ada pembanding</span>`;
    const d = a - b; if (Math.abs(d) < 0.05 * Math.max(1, Math.abs(b))) return `<span class="netral">sama seperti sebelumnya</span>`;
    const baik = naikBaik ? d > 0 : d < 0;
    return `<span class="${baik ? "baik" : "buruk"}">${ik(d > 0 ? "naik" : "turun")}${d > 0 ? "naik" : "turun"} ${f(Math.abs(d))}${satuan}</span> <span class="netral">(${baik ? "lebih baik" : "lebih buruk"})</span>`;
  }

  // meter setengah lingkaran 0-100
  function meter(nilai, warna) {
    const r = 80, cx = 100, cy = 96, sudut = Math.PI * (1 - Math.max(0, Math.min(100, nilai)) / 100);
    const x = cx + r * Math.cos(sudut), y = cy - r * Math.sin(sudut);
    return `<svg viewBox="0 0 200 118" role="img" aria-label="Nilai ${nilai} dari 100">
      <path d="M20 96 A80 80 0 0 1 180 96" fill="none" stroke="#E4E7E2" stroke-width="18" stroke-linecap="round"/>
      <path d="M20 96 A80 80 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${warna}" stroke-width="18" stroke-linecap="round"/>
      <text x="100" y="92" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="700" font-size="50" fill="#15191A">${nilai}</text>
      <text x="100" y="113" text-anchor="middle" font-family="Barlow, sans-serif" font-size="13" fill="#4E5652">dari 100</text></svg>`;
  }
  // gambar: dump truck di jalan hauling dengan lampu rambu sesuai kondisi
  function adegan(kode) {
    const nyala = { LAYAK: 2, KURANG: 1, TIDAK: 0 }[kode] ?? -1, w = ["#E5341F", "#F2B705", "#3FA34D"];
    const lampu = w.map((c, i) => `<circle cx="318" cy="${46 + i * 30}" r="11" fill="${i === nyala ? c : "#4A5052"}"/>${i === nyala ? `<circle cx="318" cy="${46 + i * 30}" r="17" fill="${c}" opacity=".25"/>` : ""}`).join("");
    return `<svg viewBox="0 0 360 190" role="img" aria-label="Gambar dump truck di jalan ALR">
      <rect width="360" height="190" rx="14" fill="#E9F0F4"/>
      <path d="M0 120 L70 70 L120 96 L190 52 L260 100 L360 64 V190 H0z" fill="#C9D8C2"/>
      <path d="M0 132 L90 104 L170 118 L250 98 L360 112 V190 H0z" fill="#A9BF9F"/>
      <path d="M0 150 H360 V190 H0z" fill="#8C6A48"/>
      <path d="M0 146 H360 V178 H0z" fill="#3A3F41"/>
      <path d="M8 162 H352" stroke="#F2B705" stroke-width="3" stroke-dasharray="18 14"/>
      <g transform="translate(36 76)">
        <path d="M4 8 L118 0 L124 52 L10 56z" fill="#F2B705" stroke="#23282A" stroke-width="3" stroke-linejoin="round"/>
        <path d="M30 8 L46 54 M70 4 L84 52" stroke="#C99600" stroke-width="3"/>
        <path d="M126 22 H164 L184 44 V70 H126z" fill="#F2B705" stroke="#23282A" stroke-width="3" stroke-linejoin="round"/>
        <path d="M136 28 H160 L174 44 H136z" fill="#9FD0F0" stroke="#23282A" stroke-width="2.5" stroke-linejoin="round"/>
        <rect x="0" y="56" width="186" height="14" rx="3" fill="#23282A"/>
        ${[26, 62, 156].map((x) => `<circle cx="${x}" cy="74" r="15" fill="#23282A"/><circle cx="${x}" cy="74" r="6" fill="#9AA0A2"/>`).join("")}
      </g>
      <rect x="314" y="96" width="8" height="54" fill="#23282A"/>
      <rect x="300" y="28" width="36" height="96" rx="8" fill="#23282A"/>${lampu}</svg>`;
  }

  function status(r, prev, dari, sampai, panjang) {
    const el = $("status"), rentangTeks = `${fmtPanjang(dari)} - ${fmtPanjang(sampai)}`;
    if (!r) {
      el.className = "hero s-KOSONG";
      el.innerHTML = `<div><span class="rentang">${ik("kalender")}${rentangTeks}</span><h2>Belum ada data</h2><p>Tidak ada data DT untuk tanggal ini. Pilih rentang lain.</p></div>`;
      $("tiles").innerHTML = ""; return;
    }
    const kal = [];
    if (r.waktu != null) kal.push(`Rata-rata 1 rit BSR ke 107 butuh <b>${jamMenit(r.waktu)}</b> (target ${jamMenit(KL.durasi_bagus_menit ?? 120)}).`);
    if (r.pctTelat != null) kal.push(`Dari 10 rit, sekitar <b>${Math.round(r.pctTelat / 10)} rit telat</b>.`);
    if (r.speed != null) kal.push(`DT jalan rata-rata <b>${Math.round(r.speed)} km/jam</b>.`);
    let arah = "";
    if (prev && prev.nilai != null) arah = r.nilai > prev.nilai + 2 ? `<span class="banding baik">${ik("naik")}Lebih baik dari ${panjang} hari sebelumnya (nilai ${prev.nilai})</span>`
      : r.nilai < prev.nilai - 2 ? `<span class="banding buruk">${ik("turun")}Lebih buruk dari ${panjang} hari sebelumnya (nilai ${prev.nilai})</span>`
      : `<span class="banding netral">Sama seperti ${panjang} hari sebelumnya</span>`;
    el.className = `hero s-${r.kode}`;
    el.innerHTML = `<div><span class="rentang">${ik("kalender")}${rentangTeks}${r.hariData < panjang ? `, data ada ${r.hariData} dari ${panjang} hari` : ""}</span>
        <h2>${JUDUL[r.kode]}</h2><p>${kal.join(" ")}</p>${arah}</div>
      <div class="meter">${meter(r.nilai, WARNA[r.kode])}<div class="k">Nilai jalan</div></div>
      <div class="adegan">${adegan(r.kode)}</div>`;
    const t = (gb, warna, k, v, b) => `<div class="tile"><div class="gb" style="background:${warna[1]};color:${warna[0]}">${ik(gb)}</div><div class="k">${k}</div><div class="v">${v}</div><div class="b">${b}</div></div>`;
    const BIRU2 = ["#2a78d6", "#E2EEFB"], OR = ["#C2531F", "#FCE6DA"], HJ = ["#1B8A5E", "#DDF3EA"], KN = ["#9A6B00", "#FFF1C2"];
    $("tiles").innerHTML =
      t("truk", BIRU2, "Jumlah rit muatan", r.rit ?? "-", banding(r.rit, prev?.rit, " rit", true, Math.round)) +
      t("jam", HJ, "Waktu 1 rit muatan", jamMenit(r.waktu), banding(r.waktu, prev?.waktu, "", false, jamMenit)) +
      t("telat", OR, "Rit telat", r.pctTelat != null ? `${Math.round(r.pctTelat)}%` : "-", banding(r.pctTelat, prev?.pctTelat, "%", false, Math.round)) +
      t("speed", KN, "Kecepatan DT", r.speed != null ? `${Math.round(r.speed)} km/jam` : "-", banding(r.speed, prev?.speed, " km/jam", true, Math.round));
  }

  function tabel(P) {
    $("tabel").innerHTML = `<tr><th>${mode === "hari" ? "Tanggal" : mode === "minggu" ? "Minggu" : "Bulan"}</th><th>Kondisi</th><th>Nilai</th><th>Jumlah rit</th><th>Waktu 1 rit</th><th>Rit telat</th><th>Kecepatan DT</th></tr>` +
      [...P].reverse().map((p) => { const r = p.r;
        return r ? `<tr><td>${p.judul}</td><td><span class="pill p-${r.kode}">${NAMA[r.kode]}</span></td><td>${r.nilai}</td><td>${r.rit ?? "-"}</td>
          <td>${jamMenit(r.waktu)}</td><td>${r.pctTelat != null ? Math.round(r.pctTelat) + "%" : "-"}</td><td>${r.speed != null ? Math.round(r.speed) + " km/j" : "-"}</td></tr>`
          : `<tr><td>${p.judul}</td><td colspan="6" style="text-align:left;color:#94a3b8">tidak ada data</td></tr>`; }).join("");
  }

  Promise.all([fetch("data/performa.json", { cache: "no-cache" }).then((r) => r.json()), fetch("data/per_km.json", { cache: "no-cache" }).then((r) => r.ok ? r.json() : null).catch(() => null)]).then(([d, km]) => {
    KM = km;
    KL = d.kelayakan || {}; TELAT = d.rit_lambat_menit || 195;
    document.querySelectorAll(".tTelat").forEach((e) => e.textContent = jamMenit(TELAT));
    d.hari.forEach((h) => HARI.set(h.tanggal, h));
    if (!d.hari.length) { $("status").innerHTML = `<div><h2>Belum ada data</h2><p>Upload data rit atau GPS dulu.</p></div>`; return; }
    awalData = tgl(d.hari[0].tanggal); akhirData = tgl(d.hari[d.hari.length - 1].tanggal);
    $("dari").min = $("sampai").min = iso(awalData); $("dari").max = $("sampai").max = iso(akhirData);
    $("catatan").innerHTML = `Tiap hari diberi nilai 0 sampai 100 dari kerja DT: makin cepat 1 rit, makin sedikit rit telat,
      makin kencang DT jalan, dan makin jarang DT berhenti di jalan, nilainya makin tinggi.
      Data tersedia ${fmtPanjang(awalData)} - ${fmtPanjang(akhirData)}. Pilihan "7 hari / 30 hari / 3 bulan" dihitung mundur dari tanggal data terakhir.`;
    document.querySelector('[data-p="semua"]').click();
  }).catch((e) => { $("status").innerHTML = `<div><h2>Gagal memuat data</h2><p>${e.message}. Coba muat ulang halaman.</p></div>`; });
})();
