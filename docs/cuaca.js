// Cuaca per KM jalan ALR.
// Gabungan 3 sumber, yang paling bisa dipercaya menang:
//   1. Laporan sopir / pengawas (2 jam terakhir)  -> paling akurat, langsung dari lapangan
//   2. Satelit Himawari (awan dingin = awan hujan), tiap 10 menit, telat ~40 menit, resolusi ~2 km
//   3. Model cuaca Open-Meteo (sekarang + 6 jam ke depan), resolusi ~10 km
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const REPO = location.hostname.endsWith("github.io")
    ? location.hostname.split(".")[0] + "/" + location.pathname.split("/").filter(Boolean)[0]
    : "ciptaprima108-oss/alr-peta";
  const SEGAR_MENIT = 10;           // ambil ulang data tiap 10 menit
  const LAPORAN_JAM = 2;            // laporan sopir berlaku 2 jam
  const ZONA = [[25, 29, "BSR & Stockpile Utara"], [20, 24, ""], [15, 19, ""], [10, 14, "dekat gorong-gorong KM 14-15"], [5, 9, "dekat pipa KM 9-10"], [0, 4, "dekat 107"]];
  const TINGKAT = [
    { nama: "Cerah", warna: "#F2B705", tinta: "#15191A" },
    { nama: "Berawan", warna: "#B8BFB7", tinta: "#15191A" },
    { nama: "Gerimis / mendung", warna: "#8EC5EE", tinta: "#15191A" },
    { nama: "Hujan", warna: "#2A78D6", tinta: "#fff" },
    { nama: "Hujan lebat", warna: "#1B2F8F", tinta: "#fff" },
  ];
  const IKON = [
    '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
    '<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.5A3.3 3.3 0 0 0 7 18z"/>',
    '<path d="M7 15h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.5A3.3 3.3 0 0 0 7 15z"/><path d="M9 19v.5M15 19v.5"/>',
    '<path d="M7 14h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.5A3.3 3.3 0 0 0 7 14z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
    '<path d="M7 13h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.5A3.3 3.3 0 0 0 7 13z"/><path d="M13 13l-2.5 4h3L11 22"/><path d="M7 16l-1 3M17 16l-1 3"/>',
  ];
  const ikon = (t, cls = "") => `<svg class="ik ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IKON[t]}</svg>`;
  const jam = (d) => d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).replace(".", ":");

  let titik = [];                 // [{km, lat, lon}]
  let model = null, satelit = null, laporan = [];
  let lapisKm = null, lapisAwan = null;

  // ---------- 1. model Open-Meteo ----------
  async function ambilModel() {
    const q = new URLSearchParams({
      latitude: titik.map((t) => t.lat).join(","), longitude: titik.map((t) => t.lon).join(","),
      current: "precipitation,rain,showers,weather_code,cloud_cover",
      hourly: "precipitation,precipitation_probability,weather_code",
      forecast_hours: "7", timezone: "Asia/Jakarta",
    });
    const r = await fetch("https://api.open-meteo.com/v1/forecast?" + q);
    if (!r.ok) throw new Error("open-meteo " + r.status);
    const j = await r.json();
    return Array.isArray(j) ? j : [j];
  }
  function tingkatModel(c) {
    if (!c) return 0;
    const w = c.weather_code, p = c.precipitation || 0;
    let t = c.cloud_cover >= 70 ? 1 : 0;
    if ([51, 53, 56].includes(w)) t = Math.max(t, 2);
    if ([55, 57, 61, 63, 66, 80, 81].includes(w) || p > 0) t = Math.max(t, 3);
    if ([65, 67, 82, 95, 96, 99].includes(w) || p >= 1) t = 4;
    return t;
  }

  // ---------- 2. satelit Himawari (NASA GIBS) ----------
  const LAPIS_SAT = "Himawari_AHI_Band13_Clean_Infrared", Z = 6;
  const urlSat = (waktu, z, x, y) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${LAPIS_SAT}/default/${waktu}/GoogleMapsCompatible_Level6/${z}/${y}/${x}.png`;
  function pikselDunia(lat, lon) {
    const n = 256 * 2 ** Z, s = Math.sin(lat * Math.PI / 180);
    return [(lon + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
  }
  async function cariWaktuSat() {
    const [px, py] = pikselDunia(titik[0].lat, titik[0].lon);
    const tx = Math.floor(px / 256), ty = Math.floor(py / 256);
    const awal = Math.floor((Date.now() - 20 * 60000) / 600000) * 600000;
    for (let i = 0; i < 14; i++) {
      const w = new Date(awal - i * 600000), iso = w.toISOString().slice(0, 19) + "Z";
      const r = await fetch(urlSat(iso, Z, tx, ty));
      if (r.ok && (r.headers.get("content-type") || "").includes("image")) return { waktu: w, iso };
    }
    return null;
  }
  // warna gambar IR: abu-abu = awan hangat / tidak ada awan; berwarna = puncak awan sangat dingin (awan hujan)
  function tingkatPiksel(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 25) return mx < 170 ? 0 : mx < 215 ? 1 : 2;
    const d = mx - mn; let h;
    if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
    if (h >= 170 && h < 265) return 2;   // biru / toska: awan mulai tebal
    if (h >= 55 && h < 170) return 3;    // hijau / kuning: awan hujan
    return 4;                            // oranye / merah / ungu: awan hujan lebat / petir
  }
  async function ambilSatelit() {
    const w = await cariWaktuSat();
    if (!w) return null;
    const ubin = {}, hasil = [];
    for (const t of titik) {
      const [px, py] = pikselDunia(t.lat, t.lon);
      const tx = Math.floor(px / 256), ty = Math.floor(py / 256), k = tx + "/" + ty;
      if (!ubin[k]) {
        const b = await (await fetch(urlSat(w.iso, Z, tx, ty))).blob();
        const im = await createImageBitmap(b);
        const c = document.createElement("canvas"); c.width = c.height = 256;
        const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(im, 0, 0);
        ubin[k] = x;
      }
      // ambil 3x3 piksel di sekitar titik (~7 km), pakai yang paling "hujan" di tengah + rata-rata tetangga
      const cx = Math.floor(px % 256), cy = Math.floor(py % 256);
      const d = ubin[k].getImageData(Math.max(0, cx - 1), Math.max(0, cy - 1), 3, 3).data;
      const nilai = [];
      for (let i = 0; i < d.length; i += 4) nilai.push(tingkatPiksel(d[i], d[i + 1], d[i + 2]));
      const tengah = nilai[4] ?? nilai[0];
      const rata = nilai.reduce((a, b) => a + b, 0) / nilai.length;
      hasil.push(Math.round(Math.max(tengah, rata)));
    }
    return { waktu: w.waktu, iso: w.iso, tingkat: hasil };
  }

  // ---------- 3. laporan sopir / pengawas (GitHub Issues berjudul [HUJAN]) ----------
  async function ambilLaporan() {
    const r = await fetch(`https://api.github.com/repos/${REPO}/issues?state=all&per_page=50&sort=created&direction=desc`);
    if (!r.ok) return [];
    const batas = Date.now() - LAPORAN_JAM * 3600000;
    return (await r.json()).filter((i) => !i.pull_request && /^\s*\[HUJAN\]/i.test(i.title) && new Date(i.created_at) > batas).map((i) => {
      const teks = i.title + "\n" + (i.body || "");
      const cari = i.title.match(/KM\s*([0-9]+(?:[.,][0-9]+)?)/i) || (i.body || "").match(/KM berapa\?\s*#*\s*([0-9]+(?:[.,][0-9]+)?)/i);
      const km = parseFloat((cari || [])[1]?.replace(",", "."));
      const low = teks.toLowerCase();
      const t = /reda|berhenti|kering/.test(low) ? 1 : /deras|lebat|petir/.test(low) ? 4 : /gerimis|rintik/.test(low) ? 2 : 3;
      return { km, tingkat: t, waktu: new Date(i.created_at), oleh: i.user?.login || "", url: i.html_url };
    }).filter((x) => !isNaN(x.km));
  }

  // ---------- gabungkan ----------
  function statusKm() {
    return titik.map((t, i) => {
      const m = tingkatModel(model?.[i]?.current);
      const s = satelit ? satelit.tingkat[i] : null;
      let tk = Math.max(m, s ?? 0), sumber = s != null && s >= m ? "satelit" : "model";
      const lap = laporan.filter((l) => Math.abs(l.km - t.km) <= 1).sort((a, b) => b.waktu - a.waktu)[0];
      if (lap) { tk = lap.tingkat; sumber = "laporan"; }
      return { ...t, tingkat: tk, sumber, model: m, sat: s, lap };
    });
  }
  function rentang(list) {   // [3,4,5,8] -> "KM 3-5, KM 8"
    const out = []; let a = null, b = null;
    for (const k of list.sort((x, y) => x - y)) { if (a === null) a = b = k; else if (k === b + 1) b = k; else { out.push([a, b]); a = b = k; } }
    if (a !== null) out.push([a, b]);
    return out.map(([x, y]) => (x === y ? `KM ${x}` : `KM ${x}-${y}`)).join(", ");
  }
  function ramalan() {   // per jam ke depan: peluang & mm terbesar di tiap zona
    if (!model?.[0]?.hourly) return null;
    const h = model[0].hourly, now = Date.now(), idx = [];
    h.time.forEach((t, i) => { const d = new Date(t + ":00+07:00"); if (d.getTime() + 3600000 > now && idx.length < 6) idx.push(i); });
    return {
      jam: idx.map((i) => h.time[i].slice(11, 16)),
      zona: ZONA.map(([a, b, nama]) => {
        const pt = titik.map((t, i) => [t, i]).filter(([t]) => t.km >= a && t.km <= b).map(([, i]) => model[i].hourly);
        return { a, b, nama, jam: idx.map((i) => ({ p: Math.max(...pt.map((x) => x.precipitation_probability[i] ?? 0)), mm: Math.max(...pt.map((x) => x.precipitation[i] ?? 0)) })) };
      }),
    };
  }

  // ---------- tampilan ----------
  function tampil() {
    const st = statusKm(), sekarang = new Date();
    const hujan = st.filter((s) => s.tingkat >= 3).map((s) => s.km), mendung = st.filter((s) => s.tingkat === 2).map((s) => s.km);
    const rm = ramalan();
    let maxP = { p: 0 };
    rm?.zona.forEach((z) => z.jam.slice(0, 3).forEach((j) => { if (j.p > maxP.p) maxP = { p: j.p, z }; }));
    const tkMax = Math.max(...st.map((s) => s.tingkat));
    const T = TINGKAT[tkMax];
    $("cuacaBanner").style.background = T.warna; $("cuacaBanner").style.color = T.tinta;
    $("cuacaBanner").innerHTML = `${ikon(tkMax, "besar")}<div><b>${hujan.length ? "Ada hujan di " + rentang(hujan) : mendung.length ? "Gerimis / mendung di " + rentang(mendung) : "Jalan ALR tidak hujan sekarang"}</b>
      <span>${hujan.length && mendung.length ? "Gerimis / mendung di " + rentang(mendung) + ". " : ""}${rm ? `3 jam ke depan: peluang hujan paling tinggi <b>${maxP.p}%</b>${maxP.z ? ` di KM ${maxP.z.a}-${maxP.z.b}` : ""}.` : ""}</span></div>`;

    // pita per KM: kiri BSR (KM 29), kanan 107 (KM 0), sama seperti pita kondisi jalan
    $("cuacaPita").innerHTML = st.slice().reverse().map((s) => {
      const T = TINGKAT[s.tingkat];
      return `<div class="ck" style="background:${T.warna};color:${T.tinta}" title="KM ${s.km}: ${T.nama} (${s.sumber})">
        ${ikon(s.tingkat)}<b>${s.km}</b>${s.sumber === "laporan" ? '<i class="lap">lapor</i>' : ""}</div>`;
    }).join("");

    // kartu zona: sekarang + 6 jam ke depan
    $("cuacaZona").innerHTML = ZONA.map(([a, b, nama], zi) => {
      const sz = st.filter((s) => s.km >= a && s.km <= b), tk = Math.max(...sz.map((s) => s.tingkat)), T = TINGKAT[tk];
      const z = rm?.zona[zi];
      const baris = z ? z.jam.map((j, k) => `<div class="cj"><small>${rm.jam[k]}</small><span class="tetes" style="--p:${j.p}">${j.p}%</span>${j.mm >= 0.1 ? `<em>${j.mm.toFixed(1)} mm</em>` : "<em>&nbsp;</em>"}</div>`).join("") : '<p class="kecil">Ramalan belum termuat.</p>';
      return `<div class="cz"><div class="cz-atas" style="background:${T.warna};color:${T.tinta}">${ikon(tk, "sedang")}<div><b>KM ${a}-${b}</b><span>${T.nama}${nama ? " · " + esc(nama) : ""}</span></div></div>
        <div class="cz-jam">${baris}</div></div>`;
    }).join("");

    // laporan
    $("cuacaLapor").innerHTML = laporan.length
      ? laporan.map((l) => `<a class="cl" href="${esc(l.url)}" target="_blank" rel="noopener"><span style="background:${TINGKAT[l.tingkat].warna};color:${TINGKAT[l.tingkat].tinta}">${ikon(l.tingkat)}</span><b>KM ${l.km}</b> ${TINGKAT[l.tingkat].nama}<small>${jam(l.waktu)} WIB${l.oleh ? " · " + esc(l.oleh) : ""}</small></a>`).join("")
      : `<p class="kecil">Belum ada laporan hujan ${LAPORAN_JAM} jam terakhir.</p>`;

    $("cuacaWaktu").textContent = `Diperbarui ${jam(sekarang)} WIB` + (satelit ? ` · foto satelit jam ${jam(satelit.waktu)} WIB` : " · satelit belum termuat");

    // peta: titik per KM
    if (lapisKm) {
      lapisKm.clearLayers();
      st.forEach((s) => {
        if (s.tingkat < 2) return;   // hanya tampil kalau mendung / hujan supaya peta tidak ramai
        const T = TINGKAT[s.tingkat];
        // lingkaran biru di BAWAH garis jalan: jadi "cahaya" biru di sekitar jalan, warna kondisi jalan tetap kelihatan
        L.circleMarker([s.lat, s.lon], { pane: "cuaca", radius: s.tingkat >= 4 ? 18 : s.tingkat === 3 ? 15 : 12, stroke: false, fillColor: T.warna, fillOpacity: s.tingkat >= 3 ? 0.75 : 0.6 })
          .bindTooltip(`KM ${s.km}: ${T.nama}`, { direction: "top" })
          .bindPopup(`<b>KM ${s.km}: ${T.nama}</b><br><span class="kecil">Dari ${s.sumber === "laporan" ? "laporan lapangan" : s.sumber === "satelit" ? "foto awan satelit" : "model cuaca"}</span>`)
          .addTo(lapisKm);
      });
    }
    if (lapisAwan && satelit) lapisAwan.setUrl(urlSat(satelit.iso, "{z}", "{x}", "{y}"));
  }

  function siapkanPeta() {
    const P = window.ALR_PETA;
    if (!P) return;
    P.map.createPane("cuaca").style.zIndex = 390;   // di bawah garis jalan (overlayPane = 400)
    lapisKm = L.layerGroup().addTo(P.map);
    lapisAwan = L.tileLayer(urlSat("default", "{z}", "{x}", "{y}"), { maxNativeZoom: 6, maxZoom: 19, opacity: 0.5, attribution: "Awan: NASA GIBS / JMA Himawari" });
    P.kontrolLapis.addOverlay(lapisKm, "Hujan per KM");
    P.kontrolLapis.addOverlay(lapisAwan, "Awan satelit (Himawari)");
  }

  let terakhir = 0;
  async function segarkan() {
    if (Date.now() - terakhir < 3 * 60000) return;
    terakhir = Date.now();
    const [m, s, l] = await Promise.allSettled([ambilModel(), ambilSatelit(), ambilLaporan()]);
    if (m.status === "fulfilled") model = m.value; else console.warn("cuaca model", m.reason);
    if (s.status === "fulfilled" && s.value) satelit = s.value; else if (s.status === "rejected") console.warn("cuaca satelit", s.reason);
    if (l.status === "fulfilled") laporan = l.value;
    if (!model && !satelit) { $("cuacaBanner").innerHTML = "<div><b>Data cuaca belum bisa dimuat</b><span>Cek sinyal internet, nanti dicoba lagi otomatis.</span></div>"; return; }
    tampil();
  }

  async function mulai() {
    if (!$("cuaca")) return;
    titik = await (await fetch("data/km_cuaca.json")).json();
    $("btnLaporHujan").href = `https://github.com/${REPO}/issues/new?` + new URLSearchParams({ template: "laporan_hujan.yml", title: "[HUJAN] KM " });
    siapkanPeta();
    await segarkan();
    setInterval(segarkan, SEGAR_MENIT * 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) segarkan(); });
  }
  mulai().catch((e) => console.warn("cuaca", e));
})();
