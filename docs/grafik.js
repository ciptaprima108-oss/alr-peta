// Grafik performa jalan ALR: harian / mingguan / bulanan dari docs/data/performa.json
(function () {
  const $ = (id) => document.getElementById(id);
  const WARNA = { Layak: "#16a34a", "Perlu perhatian": "#f59e0b", "Tidak layak": "#dc2626" };
  const IKON = { Layak: "✅", "Perlu perhatian": "⚠️", "Tidak layak": "⛔" };
  const BIRU = "#2563eb", BIRU_MUDA = "#93c5fd", ABU = "#9ca3af";
  const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  let DATA = null, KL = {}, mode = "hari", grafik = {};

  const tgl = (s) => new Date(s + "T00:00:00");
  const fmtTgl = (d) => `${d.getDate()} ${BULAN[d.getMonth()]}`;
  const senin = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const statusDari = (i) => i == null ? null : i >= (KL.batas_layak ?? 75) ? "Layak" : i >= (KL.batas_perhatian ?? 50) ? "Perlu perhatian" : "Tidak layak";
  const rata = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const rataBobot = (a, w) => { let s = 0, n = 0; a.forEach((x, i) => { if (x != null && w[i]) { s += x * w[i]; n += w[i]; } }); return n ? s / n : rata(a); };
  const r1 = (x) => x == null ? null : Math.round(x * 10) / 10;

  function kelompok(hari, m) {
    if (m === "hari") return hari.map((h) => ({ ...h, kunci: h.tanggal, label: fmtTgl(tgl(h.tanggal)), judul: tgl(h.tanggal).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }), n_hari: 1 }));
    const g = new Map();
    for (const h of hari) {
      const d = tgl(h.tanggal), k = m === "minggu" ? iso(senin(d)) : h.tanggal.slice(0, 7);
      if (!g.has(k)) g.set(k, []); g.get(k).push(h);
    }
    return [...g.entries()].map(([k, a]) => {
      const nt = a.map((x) => x.n_trip), tot = nt.reduce((s, x) => s + (x || 0), 0), lam = a.reduce((s, x) => s + (x.n_lambat || 0), 0);
      const idx = rata(a.map((x) => x.indeks));
      let label, judul;
      if (m === "minggu") { const s = tgl(k), e = new Date(s); e.setDate(e.getDate() + 6); label = `${fmtTgl(s)}`; judul = `Minggu ${fmtTgl(s)} - ${fmtTgl(e)} ${e.getFullYear()}`; }
      else { const [y, mo] = k.split("-"); label = `${BULAN[+mo - 1]} ${y}`; judul = `Bulan ${BULAN[+mo - 1]} ${y}`; }
      return { kunci: k, label, judul, n_hari: a.length, n_trip: tot || null, n_lambat: lam,
        median_menit: r1(rataBobot(a.map((x) => x.median_menit), nt)), p90_menit: r1(rataBobot(a.map((x) => x.p90_menit), nt)),
        pct_lambat: tot ? r1(lam / tot * 100) : null, gps_speed: r1(rata(a.map((x) => x.gps_speed))),
        gps_pct_berhenti: r1(rata(a.map((x) => x.gps_pct_berhenti))), indeks: idx == null ? null : Math.round(idx), status: statusDari(idx) };
    });
  }

  function opsi(yMax, satuan) {
    return { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y ?? "-"} ${satuan}` } } },
      scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12, color: "#6b7280" } },
        y: { beginAtZero: true, max: yMax, grid: { color: "#eef0f3" }, border: { display: false }, ticks: { color: "#6b7280" } } } };
  }
  function buat(id, cfg) { grafik[id]?.destroy(); grafik[id] = new Chart($(id), cfg); }
  const garisTarget = (n, v, label) => ({ type: "line", label, data: Array(n).fill(v), borderColor: "#6b7280", borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, pointHitRadius: 0 });
  const batang = (label, data, warna) => ({ type: "bar", label, data, backgroundColor: warna, borderRadius: 4, borderSkipped: "start", maxBarThickness: 34 });
  const garis = (label, data, warna, dash) => ({ type: "line", label, data, borderColor: warna, backgroundColor: warna, borderWidth: 2, borderDash: dash || [], pointRadius: 3.5, pointHoverRadius: 6, spanGaps: true, tension: 0.25 });

  function gambar() {
    const rows = kelompok(DATA.hari, mode), L = rows.map((r) => r.label), n = rows.length;
    const o1 = opsi(100, "");
    o1.plugins.tooltip.callbacks.label = (c) => ` Nilai ${c.parsed.y ?? "-"} · ${rows[c.dataIndex].status || "-"}`;
    buat("cIndeks", { data: { labels: L, datasets: [batang("Nilai", rows.map((r) => r.indeks), rows.map((r) => WARNA[r.status] || ABU)),
      garisTarget(n, KL.batas_layak ?? 75, "Batas layak"), garisTarget(n, KL.batas_perhatian ?? 50, "Batas perhatian")] }, options: o1 });
    const o2 = opsi(undefined, "menit"); o2.plugins.legend = { display: true, labels: { boxWidth: 14, usePointStyle: true, filter: (i) => !i.text.startsWith("Target") } };
    buat("cDurasi", { data: { labels: L, datasets: [garis("Median", rows.map((r) => r.median_menit), BIRU), garis("p90", rows.map((r) => r.p90_menit), BIRU_MUDA, [3, 3]),
      garisTarget(n, KL.durasi_bagus_menit ?? 120, "Target")] }, options: o2 });
    buat("cLambat", { data: { labels: L, datasets: [batang("Rit lambat", rows.map((r) => r.pct_lambat), BIRU)] }, options: opsi(undefined, "%") });
    buat("cRit", { data: { labels: L, datasets: [batang("Jumlah rit", rows.map((r) => r.n_trip), BIRU)] }, options: opsi(undefined, "rit") });
    buat("cSpeed", { data: { labels: L, datasets: [garis("Speed", rows.map((r) => r.gps_speed), BIRU), garisTarget(n, KL.speed_bagus_kmh ?? 20, "Target")] }, options: opsi(undefined, "km/jam") });

    // pilihan periode (default terakhir)
    const sel = $("pilihPeriode"), lama = sel.value;
    sel.innerHTML = rows.map((r, i) => `<option value="${i}">${r.judul}</option>`).reverse().join("");
    sel.value = rows[+lama] && sel.dataset.mode === mode ? lama : String(n - 1); sel.dataset.mode = mode;
    vonis(rows, +sel.value);
    tabel(rows);
  }

  function selisih(a, b, satuan, lebihBaikNaik) {
    if (a == null || b == null) return "";
    const d = r1(a - b); if (!d) return `<span class="sub">sama dengan sebelumnya</span>`;
    const baik = lebihBaikNaik ? d > 0 : d < 0;
    return `<span class="${baik ? "naik" : "turun"}">${d > 0 ? "▲" : "▼"} ${Math.abs(d)} ${satuan}</span> <span class="sub">vs sebelumnya</span>`;
  }
  function vonis(rows, i) {
    const r = rows[i], p = rows[i - 1], st = r.status;
    const v = $("vonis"); v.style.borderLeftColor = WARNA[st] || ABU;
    const arah = p && r.indeks != null && p.indeks != null ? (r.indeks > p.indeks + 2 ? "membaik" : r.indeks < p.indeks - 2 ? "memburuk" : "stabil") : null;
    const masalah = [];
    if (r.median_menit != null && r.median_menit > (KL.durasi_bagus_menit ?? 120)) masalah.push(`durasi rit ${r.median_menit} menit (target ${KL.durasi_bagus_menit ?? 120})`);
    if (r.pct_lambat != null && r.pct_lambat >= 20) masalah.push(`${r.pct_lambat}% rit lambat`);
    if (r.gps_speed != null && r.gps_speed < (KL.speed_bagus_kmh ?? 20)) masalah.push(`speed DT ${r.gps_speed} km/jam`);
    if (r.gps_pct_berhenti != null && r.gps_pct_berhenti >= 15) masalah.push(`DT berhenti ${r.gps_pct_berhenti}% waktu di jalan`);
    v.innerHTML = `<h2>${IKON[st] || ""} Jalan ALR ${st ? st.toUpperCase() : "belum bisa dinilai"} <span style="font-weight:500;color:#6b7280">· nilai ${r.indeks ?? "-"}/100</span></h2>
      <p><b>${r.judul}</b>${r.n_hari > 1 ? ` (${r.n_hari} hari ada data)` : ""}${arah ? ` · dibanding periode sebelumnya: <b class="${arah === "membaik" ? "naik" : arah === "memburuk" ? "turun" : ""}">${arah}</b>` : ""}</p>
      <p>${masalah.length ? "Yang bikin nilai turun: " + masalah.join(", ") + "." : "Semua ukuran dalam target."}</p>`;
    const t = (lbl, val, sub) => `<div class="tile"><div class="lbl">${lbl}</div><div class="val">${val ?? "-"}</div><div class="sub">${sub || ""}</div></div>`;
    $("tiles").innerHTML =
      t("Nilai kelayakan", r.indeks, selisih(r.indeks, p?.indeks, "poin", true)) +
      t("Jumlah rit", r.n_trip, selisih(r.n_trip, p?.n_trip, "rit", true)) +
      t("Durasi rit median", r.median_menit != null ? r.median_menit + " mnt" : null, selisih(r.median_menit, p?.median_menit, "mnt", false)) +
      t("Rit lambat", r.pct_lambat != null ? r.pct_lambat + "%" : null, selisih(r.pct_lambat, p?.pct_lambat, "%", false)) +
      t("Speed DT di jalan", r.gps_speed != null ? r.gps_speed + " km/j" : null, selisih(r.gps_speed, p?.gps_speed, "km/j", true)) +
      t("DT berhenti di jalan", r.gps_pct_berhenti != null ? r.gps_pct_berhenti + "%" : null, selisih(r.gps_pct_berhenti, p?.gps_pct_berhenti, "%", false));
  }
  function tabel(rows) {
    const f = (x, s = "") => x == null ? "-" : x + s;
    $("tabel").innerHTML = `<tr><th>Periode</th><th>Status</th><th>Nilai</th><th>Rit</th><th>Durasi median</th><th>p90</th><th>Rit lambat</th><th>Speed DT</th><th>Berhenti</th></tr>` +
      [...rows].reverse().map((r) => `<tr><td>${r.judul}</td><td>${r.status ? `<span class="pill p-${r.status.split(" ")[0]}">${IKON[r.status]} ${r.status}</span>` : "-"}</td>
        <td>${f(r.indeks)}</td><td>${f(r.n_trip)}</td><td>${f(r.median_menit, " mnt")}</td><td>${f(r.p90_menit, " mnt")}</td>
        <td>${f(r.pct_lambat, "%")}</td><td>${f(r.gps_speed, " km/j")}</td><td>${f(r.gps_pct_berhenti, "%")}</td></tr>`).join("");
  }

  document.querySelectorAll("#mode button").forEach((b) => b.onclick = () => {
    document.querySelectorAll("#mode button").forEach((x) => x.classList.toggle("aktif", x === b));
    mode = b.dataset.m; gambar();
  });
  $("pilihPeriode").onchange = (e) => vonis(kelompok(DATA.hari, mode), +e.target.value);

  fetch("data/performa.json").then((r) => r.json()).then((d) => {
    DATA = d; KL = d.kelayakan || {};
    $("tDur").textContent = KL.durasi_bagus_menit ?? 120; $("tLambat").textContent = d.rit_lambat_menit;
    const isi = (c, v) => document.querySelectorAll(c).forEach((e) => e.textContent = v);
    isi(".k-dur-b", KL.durasi_bagus_menit); isi(".k-dur-j", KL.durasi_jelek_menit); isi(".k-lam", KL.pct_lambat_jelek);
    isi(".k-sp-b", KL.speed_bagus_kmh); isi(".k-sp-j", KL.speed_jelek_kmh); isi(".k-ber", KL.pct_berhenti_jelek);
    if (!d.hari.length) { $("vonis").innerHTML = "<h2>Belum ada data performa</h2><p>Upload data rit atau GPS dulu.</p>"; return; }
    gambar();
  }).catch((e) => { $("vonis").innerHTML = `<h2>Gagal memuat data</h2><p>${e.message}</p>`; });
})();
