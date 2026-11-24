// Halaman Kondisi Jalan ALR: nilai kelayakan dari performa DT, filter rentang tanggal, per hari/minggu/bulan
(function () {
  const $ = (id) => document.getElementById(id);
  const WARNA = { LAYAK: "#16a34a", KURANG: "#f59e0b", TIDAK: "#dc2626", KOSONG: "#eef2f6" };
  const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const BIRU = "#2563eb";
  let KM = null,
  HARI = new Map(), KL = {}, TELAT = 195, mode = "hari", grafik = {}, awalData, akhirData;

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
  const NAMA = { LAYAK: "LAYAK", KURANG: "KURANG LAYAK", TIDAK: "TIDAK LAYAK", KOSONG: "Tidak ada data" };
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
    o.plugins.tooltip.callbacks.label = (c) => { const r = P[c.dataIndex].r; return r ? ` Nilai ${r.nilai} · ${NAMA[r.kode]}` : " Tidak ada data (belum diupload)"; };
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
    buat("cWaktu", { labels: L, datasets: [garis("Waktu 1 rit", P.map((p) => p.r && s1(p.r.waktu / 60))), target(n, s1((KL.durasi_bagus_menit ?? 120) / 60))] }, opsi("jam"), J);
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
  function perKm(dari, sampai) {
    const daftar = KM.km, n = daftar.length, tot = daftar.map(() => [0, 0, 0, 0, 0, new Set()]);
    for (let d = new Date(dari); d <= sampai; d = tambah(d, 1)) {
      const h = KM.hari[iso(d)]; if (!h) continue;
      for (const k in h) { const t = tot[k], v = h[k]; for (let i = 0; i < 5; i++) t[i] += v[i]; v[5].forEach((u) => t[5].add(u)); }
    }
    const semuaUrut = [...daftar].reverse();                     // BSR (KM 26-27) di kiri, 107 di kanan = arah muatan
    const urut = semuaUrut.filter((k) => !k.zona);                // zona antre/parkir tidak digambar di grafik (bukan masalah jalan)
    const zonaJam = {};
    semuaUrut.filter((k) => k.zona).forEach((k) => { const t = tot[k.km]; zonaJam[k.zona] = (zonaJam[k.zona] || 0) + t[1] + t[2]; });
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

    // KM paling bermasalah (bukan zona antre/parkir)
    const skor = daftar.filter((k) => !k.zona).map((k) => { const t = tot[k.km]; return { k, jam: t[1] + t[2], hidup: t[1], sp: t[4] ? t[3] / t[4] : null, unit: t[5].size }; })
      .filter((x) => x.jam > 0 || (x.sp != null && x.sp <= 13)).sort((a, b) => b.jam - a.jam).slice(0, 5);
    $("topKm").innerHTML = skor.length ? `<div class="top">${skor.map((x, i) => `<div class="it"><b>${i + 1}. ${x.k.label}</b> <span class="netral">(STA ${x.k.km}+000 - ${x.k.km + 1}+000)</span><br>
        ⏸️ <b>${x.jam} jam</b> unit tertahan (${x.hidup} jam mesin hidup)<br>💨 ${x.sp != null ? Math.round(x.sp) + " km/jam" : "-"} · 🚚 ${x.unit} unit</div>`).join("")}</div>`
      : `<p class="netral">Tidak ada KM bermasalah di rentang ini.</p>`;
    const zt = Object.entries(zonaJam).filter(([, v]) => v);
    if (zt.length) $("topKm").innerHTML += `<div class="kosong-info">Tidak dihitung karena bukan masalah jalan: ${zt.map(([z, v]) => `${z} ${v} jam`).join(" · ")}.</div>`;

    // tabel warna KM x periode
    const P = periode(dari, sampai);
    const per = [];  // per periode: jam tertahan per km
    for (const p of P) {
      const a = Array(n).fill(null);
      p.tgl.forEach((t) => { const h = KM.hari[t]; if (!h) return; for (const k in h) a[k] = (a[k] || 0) + h[k][1] + h[k][2]; });
      per.push(a);
    }
    const maks = Math.max(1, ...per.flatMap((a) => urut.map((k) => a[k.km] || 0)));
    const warna = (v) => { if (!v) return "#f8fafc"; const x = Math.min(1, v / Math.max(6, maks * 0.6)); return `rgba(220,38,38,${0.12 + 0.78 * x})`; };
    $("heat").innerHTML = `<table class="heat"><thead><tr><th></th>${P.map((p) => `<th>${p.label}</th>`).join("")}</tr></thead><tbody>` +
      semuaUrut.map((k) => `<tr><th>${k.label}${k.zona ? "*" : ""}</th>${per.map((a, i) => { const v = a[k.km];
        return `<td style="background:${k.zona ? (v ? "#e2e8f0" : "#f8fafc") : warna(v)};color:${!k.zona && v && v / maks > 0.5 ? "#fff" : "#111"}" title="${k.label} · ${P[i].judul}: ${v ? v + " jam unit tertahan" : "tidak ada"}">${v || ""}</td>`; }).join("")}</tr>`).join("") + `</tbody></table>`;
  }

  function banding(a, b, satuan, naikBaik, f = (x) => s1(x)) {
    if (a == null || b == null) return `<span class="netral">belum ada pembanding</span>`;
    const d = a - b; if (Math.abs(d) < 0.05 * Math.max(1, Math.abs(b))) return `<span class="netral">sama seperti sebelumnya</span>`;
    const baik = naikBaik ? d > 0 : d < 0;
    return `<span class="${baik ? "baik" : "buruk"}">${d > 0 ? "▲ naik" : "▼ turun"} ${f(Math.abs(d))}${satuan}</span> <span class="netral">· ${baik ? "lebih baik" : "lebih buruk"}</span>`;
  }

  function status(r, prev, dari, sampai, panjang) {
    const el = $("status"), rentangTeks = `${fmtPanjang(dari)} - ${fmtPanjang(sampai)}`;
    if (!r) {
      el.className = "status s-KOSONG";
      el.innerHTML = `<div class="ikon">📭</div><div><h2>Belum ada data</h2><p>Tidak ada data DT untuk ${rentangTeks}. Pilih rentang lain.</p></div>`;
      $("tiles").innerHTML = ""; return;
    }
    const kal = [];
    if (r.waktu != null) kal.push(`Rata-rata 1 rit BSR ke 107 butuh <b>${jamMenit(r.waktu)}</b> (target ${jamMenit(KL.durasi_bagus_menit ?? 120)}).`);
    if (r.pctTelat != null) kal.push(`Dari 10 rit, sekitar <b>${Math.round(r.pctTelat / 10)} rit telat</b> (lebih dari ${jamMenit(TELAT)}).`);
    if (r.speed != null) kal.push(`DT jalan rata-rata <b>${Math.round(r.speed)} km/jam</b>.`);
    let arah = "";
    if (prev && prev.nilai != null) arah = r.nilai > prev.nilai + 2 ? `Lebih baik dari ${panjang} hari sebelumnya (nilai ${prev.nilai}).` : r.nilai < prev.nilai - 2 ? `Lebih buruk dari ${panjang} hari sebelumnya (nilai ${prev.nilai}).` : `Sama seperti ${panjang} hari sebelumnya.`;
    el.className = `status s-${r.kode}`;
    el.innerHTML = `<div class="ikon">${IKON[r.kode]}</div><div><h2>Jalan ALR ${NAMA[r.kode]}</h2>
      <div class="nilai">Nilai ${r.nilai} dari 100 · ${rentangTeks}${r.hariData < panjang ? ` · data ada ${r.hariData} dari ${panjang} hari` : ""}</div>
      <p>${kal.join(" ")} ${arah}</p></div>`;
    const t = (k, v, b) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="b">${b}</div></div>`;
    $("tiles").innerHTML =
      t("🚚 Jumlah rit", r.rit ?? "-", banding(r.rit, prev?.rit, " rit", true, Math.round)) +
      t("⏱️ Waktu 1 rit", jamMenit(r.waktu), banding(r.waktu, prev?.waktu, "", false, jamMenit)) +
      t("🐢 Rit telat", r.pctTelat != null ? `${Math.round(r.pctTelat)}%` : "-", banding(r.pctTelat, prev?.pctTelat, "%", false, Math.round)) +
      t("💨 Kecepatan DT", r.speed != null ? `${Math.round(r.speed)} km/j` : "-", banding(r.speed, prev?.speed, " km/j", true, Math.round));
  }

  function tabel(P) {
    $("tabel").innerHTML = `<tr><th>${mode === "hari" ? "Tanggal" : mode === "minggu" ? "Minggu" : "Bulan"}</th><th>Kondisi</th><th>Nilai</th><th>Jumlah rit</th><th>Waktu 1 rit</th><th>Rit telat</th><th>Kecepatan DT</th></tr>` +
      [...P].reverse().map((p) => { const r = p.r;
        return r ? `<tr><td>${p.judul}</td><td><span class="pill p-${r.kode}">${IKON[r.kode]} ${NAMA[r.kode]}</span></td><td>${r.nilai}</td><td>${r.rit ?? "-"}</td>
          <td>${jamMenit(r.waktu)}</td><td>${r.pctTelat != null ? Math.round(r.pctTelat) + "%" : "-"}</td><td>${r.speed != null ? Math.round(r.speed) + " km/j" : "-"}</td></tr>`
          : `<tr><td>${p.judul}</td><td colspan="6" style="text-align:left;color:#94a3b8">tidak ada data</td></tr>`; }).join("");
  }

  Promise.all([fetch("data/performa.json", { cache: "no-cache" }).then((r) => r.json()), fetch("data/per_km.json", { cache: "no-cache" }).then((r) => r.ok ? r.json() : null).catch(() => null)]).then(([d, km]) => {
    KM = km;
    KL = d.kelayakan || {}; TELAT = d.rit_lambat_menit || 195;
    document.querySelectorAll(".tTelat").forEach((e) => e.textContent = jamMenit(TELAT));
    d.hari.forEach((h) => HARI.set(h.tanggal, h));
    if (!d.hari.length) { $("status").innerHTML = `<div class="ikon">📭</div><div><h2>Belum ada data</h2><p>Upload data rit atau GPS dulu.</p></div>`; return; }
    awalData = tgl(d.hari[0].tanggal); akhirData = tgl(d.hari[d.hari.length - 1].tanggal);
    $("dari").min = $("sampai").min = iso(awalData); $("dari").max = $("sampai").max = iso(akhirData);
    $("catatan").innerHTML = `<b>Cara baca nilai:</b> tiap hari diberi nilai 0-100 dari kerja DT: makin cepat 1 rit, makin sedikit rit telat,
      makin kencang DT jalan, dan makin jarang DT berhenti di jalan, nilainya makin tinggi. Nilai 75 ke atas = <b>layak</b>, 50-74 = <b>kurang layak</b>, di bawah 50 = <b>tidak layak</b>.
      Data tersedia ${fmtPanjang(awalData)} - ${fmtPanjang(akhirData)}. Pilihan "7 hari / 30 hari / 3 bulan" dihitung mundur dari tanggal data terakhir.`;
    document.querySelector('[data-p="semua"]').click();
  }).catch((e) => { $("status").innerHTML = `<div class="ikon">⚠️</div><div><h2>Gagal memuat data</h2><p>${e.message}</p></div>`; });
})();
