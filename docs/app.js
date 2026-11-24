// Peta Jalan ALR: segmen berwarna dari data GPS + tiket trigger/laporan dari GitHub Issues
(function () {
  // repo otomatis dari alamat GitHub Pages (owner.github.io/repo); cadangan untuk tes lokal
  const REPO_DEFAULT = "ciptaprima108-oss/alr-peta";
  const h = location.hostname.endsWith("github.io")
    ? location.hostname.split(".")[0] + "/" + location.pathname.split("/").filter(Boolean)[0]
    : REPO_DEFAULT;
  const REPO = h;
  const WARNA = { merah: "#dc2626", kuning: "#f59e0b", hijau: "#16a34a", abu: "#9ca3af", kosong: "#6b7280" };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- peta dasar ----------
  const map = L.map("map", { zoomControl: true });
  const satelit = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Citra © Esri" });
  const jalanOSM = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" });
  satelit.addTo(map);
  const lapisSegmen = L.layerGroup().addTo(map);
  const lapisSTA = L.layerGroup().addTo(map);
  const lapisSTAkecil = L.layerGroup();               // label tiap 1 km, muncul kalau di-zoom
  map.on("zoomend", () => { if (map.getZoom() >= 14 && map.hasLayer(lapisSTA)) lapisSTAkecil.addTo(map); else lapisSTAkecil.remove(); });
  const lapisTiket = L.layerGroup().addTo(map);
  L.control.layers({ "Satelit": satelit, "Peta jalan": jalanOSM }, { "Label STA": lapisSTA, "Tiket & laporan": lapisTiket }, { position: "topright" }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);

  let segmen = [], ringkasan = null;

  // ---------- util STA ----------
  const fmtSta = (s) => { let km = Math.floor(s + 1e-9), m = Math.round((s - km) * 1000); if (m === 1000) { km++; m = 0; } return `${km}+${String(m).padStart(3, "0")}`; };
  function staTerdekat(lat, lon) {
    let best = null, bd = 1e18;
    for (const f of segmen) for (const [x, y] of f.geometry.coordinates) {
      const d = (y - lat) ** 2 + ((x - lon) * Math.cos(lat * Math.PI / 180)) ** 2;
      if (d < bd) { bd = d; best = f; }
    }
    return best ? { seg: best, jarak_m: Math.sqrt(bd) * 111320 } : null;
  }
  function posisiSta(sta) {
    const f = segmen.find((f) => sta >= f.properties.sta_awal && sta <= f.properties.sta_akhir);
    return f ? [f.properties.lat, f.properties.lon] : null;
  }
  function linkLapor(sta, lat, lon) {
    const p = new URLSearchParams({ template: "laporan_jalan.yml", title: `[LAPORAN] Jalan STA ${sta}`, sta: `STA ${sta}`, koordinat: `${lat.toFixed(6)}, ${lon.toFixed(6)}`, labels: "laporan-jalan" });
    return `https://github.com/${REPO}/issues/new?${p}`;
  }
  const linkNav = (lat, lon) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;

  // ---------- segmen jalan ----------
  function popupSegmen(p) {
    const st = { merah: "🔴 MERAH", kuning: "🟡 Agak pelan", hijau: "🟢 Lancar", abu: "⚪ Zona antre/parkir", kosong: "Belum ada data" }[p.status];
    const unit = [...new Set([...(p.unit_lambat || []), ...(p.unit_tertahan || [])])];
    return `<b>${esc(p.label)}</b><br>${st}<br>${esc(p.alasan)}<br>
      <span class="kecil">${p.n_titik} titik GPS, ${p.n_unit} unit${p.speed_median != null ? `, median ${p.speed_median} km/jam` : ""}</span>
      ${unit.length ? `<br><span class="kecil">Unit: ${esc(unit.join(", "))}</span>` : ""}
      <div class="aksi"><a class="btn merah" target="_blank" href="${linkLapor(fmtSta(p.sta_awal), p.lat, p.lon)}">📷 Lapor + foto</a>
      <a class="btn abu" target="_blank" href="${linkNav(p.lat, p.lon)}">🧭 Navigasi</a></div>`;
  }
  function gambarSegmen() {
    lapisSegmen.clearLayers();
    // badan jalan utuh dulu (supaya tidak putus-putus), lalu warna status di atasnya; merah paling atas
    const semua = [];
    for (const f of segmen) for (const [x, y] of f.geometry.coordinates) semua.push([y, x]);
    L.polyline(semua, { color: "#111827", weight: 13, opacity: 0.9, interactive: false }).addTo(lapisSegmen);
    L.polyline(semua, { color: WARNA.kosong, weight: 6, opacity: 1, interactive: false }).addTo(lapisSegmen);
    const urut = { kosong: 0, abu: 1, hijau: 2, kuning: 3, merah: 4 };
    for (const f of [...segmen].sort((a, b) => urut[a.properties.status] - urut[b.properties.status])) {
      const p = f.properties, ll = f.geometry.coordinates.map(([x, y]) => [y, x]);
      const tebal = p.status === "merah" ? 10 : 7;
      const garis = L.polyline(ll, { color: WARNA[p.status], weight: tebal, opacity: p.status === "kosong" ? 0.01 : 1, lineCap: "butt",
        className: p.status === "merah" ? "kedip" : "" }).bindPopup(() => popupSegmen(p)).addTo(lapisSegmen);
      garis.on("mouseover", () => garis.setStyle({ weight: tebal + 4 })).on("mouseout", () => garis.setStyle({ weight: tebal }));
    }
  }

  // ---------- titik penting & STA ----------
  function gambarTitik(gj) {
    for (const f of gj.features) {
      const [x, y] = f.geometry.coordinates, p = f.properties;
      if (p.jenis === "sta") {
        const besar = p.sta % 5 === 0;
        L.circleMarker([y, x], { radius: besar ? 6 : 4, color: "#111", weight: 2, fillColor: besar ? "#111" : "#fff", fillOpacity: 1 })
          .bindTooltip(besar ? `STA ${p.sta}` : String(p.sta), { permanent: true, direction: "right", className: "sta-label", offset: [6, 0] })
          .addTo(besar ? lapisSTA : lapisSTAkecil);
      } else if (p.jenis === "pos") {
        L.marker([y, x], { icon: L.divIcon({ className: "", html: `<div class="pos-label leaflet-tooltip">${esc(p.nama)}</div>`, iconSize: null }) }).addTo(map);
      } else {
        L.circleMarker([y, x], { radius: 9, color: "#b45309", weight: 3, fillColor: "#fde68a", fillOpacity: 0.9 })
          .bindPopup(`<b>⚠️ Titik rawan</b><br>${esc(p.nama)}${p.catatan ? `<br><span class="kecil">${esc(p.catatan)}</span>` : ""}`).addTo(map);
      }
    }
  }

  // ---------- tiket & laporan dari GitHub Issues ----------
  const polaGambar = /(https:\/\/(?:github\.com\/user-attachments\/assets\/[\w-]+|user-images\.githubusercontent\.com\/[^\s)"']+|private-user-images\.githubusercontent\.com\/[^\s)"']+))/g;
  function lokasiTiket(body) {
    let m = body.match(/<!-- sta:([\d.]+)-([\d.]+) -->/);
    if (m) { const a = +m[1], b = +m[2]; return { sta: (a + b) / 2, ll: posisiSta((a + b) / 2), label: `STA ${fmtSta(a)} - ${fmtSta(b)}` }; }
    m = body.match(/(-\d{1,2}\.\d+)\s*,\s*(\d{2,3}\.\d+)/);
    const ms = body.match(/STA\s*(\d+)\s*[+.,]\s*(\d{1,3})/i) || body.match(/STA\s*(\d+)/i);
    const sta = ms ? +ms[1] + (ms[2] ? +ms[2].padEnd(3, "0") / 1000 : 0) : null;
    if (m) return { sta, ll: [+m[1], +m[2]], label: sta != null ? `STA ${fmtSta(sta)}` : "Lokasi" };
    if (sta != null) return { sta, ll: posisiSta(sta), label: `STA ${fmtSta(sta)}` };
    return null;
  }
  async function ambilTiket() {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/issues?state=all&per_page=100&sort=created&direction=desc`);
      if (!r.ok) throw new Error(r.status);
      const issues = (await r.json()).filter((i) => !i.pull_request);
      const lbl = (i, n) => i.labels.some((l) => l.name === n);
      const trig = issues.filter((i) => lbl(i, ringkasan?.label_trigger || "trigger"));
      const lap = issues.filter((i) => lbl(i, ringkasan?.label_laporan || "laporan-jalan"));
      // ambil komentar (foto pengawas biasanya di komentar) untuk tiket yang punya komentar
      await Promise.all([...trig, ...lap].slice(0, 40).map(async (i) => {
        i._teks = i.body || "";
        if (i.comments > 0) {
          try { const c = await (await fetch(i.comments_url + "?per_page=100")).json(); i._teks += "\n" + c.map((x) => x.body).join("\n"); } catch (e) {}
        }
        i._gambar = [...new Set(i._teks.match(polaGambar) || [])];
        i._lok = lokasiTiket(i._teks);
      }));
      tampilTiket(trig, lap);
    } catch (e) {
      $("listTrig").innerHTML = `<p class="kecil">Tiket belum bisa dimuat (${esc(e.message)}). Daftar di bawah dari hasil hitung GPS.</p>` + kartuDariRingkasan();
    }
  }
  function statusTiket(i) {
    if (i.state === "closed") return `<span class="status selesai">SELESAI</span>`;
    return i._gambar.length ? `<span class="status ada">ADA FOTO</span>` : `<span class="status belum">BELUM DICEK</span>`;
  }
  function kartu(i, jenis) {
    const lok = i._lok, ll = lok?.ll;
    const thumbs = i._gambar.slice(0, 4).map((u) => `<img src="${esc(u)}" loading="lazy" onerror="this.remove()">`).join("");
    return `<div class="kartu ${jenis} ${i.state === "closed" ? "tutup" : ""}" data-ll="${ll ? ll.join(",") : ""}">
      <b>${esc(lok?.label || i.title)}</b>${statusTiket(i)}
      <div class="baris">#${i.number} · ${new Date(i.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })} · ${i._gambar.length} lampiran</div>
      ${thumbs ? `<div class="thumbs">${thumbs}</div>` : ""}
      <div class="baris"><a target="_blank" href="${i.html_url}">${jenis === "lap" ? "Buka laporan" : "Buka tiket / upload foto"} →</a></div></div>`;
  }
  function tampilTiket(trig, lap) {
    if (!trig.length && !lap.length) return;           // belum ada tiket: pakai bendera dari hasil hitung GPS
    lapisTiket.clearLayers();
    const buka = trig.filter((i) => i.state === "open");
    $("nTrig").textContent = buka.length;
    $("listTrig").innerHTML = trig.length ? trig.map((i) => kartu(i, "trig")).join("") : `<p class="kecil">Tidak ada trigger.</p>`;
    $("listLap").innerHTML = lap.length ? lap.map((i) => kartu(i, "lap")).join("") : `<p class="kecil">Belum ada laporan.</p>`;
    for (const i of [...trig, ...lap]) {
      if (!i._lok?.ll) continue;
      const isTrig = trig.includes(i);
      const ikon = L.divIcon({ className: "", iconSize: [30, 30], iconAnchor: [15, 30],
        html: `<div style="font-size:26px;line-height:30px;filter:drop-shadow(0 1px 2px #000)">${isTrig ? (i._gambar.length ? "📸" : "🚩") : "📷"}</div>` });
      L.marker(i._lok.ll, { icon: ikon, zIndexOffset: 1000 }).bindPopup(
        `<b>${esc(i.title)}</b><br>${statusTiket(i)}<br><span class="kecil">${i._gambar.length} lampiran</span>
         <div class="thumbs">${i._gambar.slice(0, 6).map((u) => `<a target="_blank" href="${esc(u)}"><img src="${esc(u)}" onerror="this.remove()"></a>`).join("")}</div>
         <div class="aksi"><a class="btn merah" target="_blank" href="${i.html_url}">${isTrig ? "📷 Upload foto/video" : "Buka laporan"}</a>
         <a class="btn abu" target="_blank" href="${linkNav(...i._lok.ll)}">🧭 Navigasi</a></div>`).addTo(lapisTiket);
    }
    pasangKlikKartu();
  }
  function kartuDariRingkasan() {
    return (ringkasan?.trigger || []).map((t) => `<div class="kartu" data-ll="${t.lat},${t.lon}"><b>STA ${fmtSta(t.sta_awal)} - ${fmtSta(t.sta_akhir)}</b>
      <div class="baris">${esc(t.alasan)}</div><div class="baris">Unit: ${esc(t.unit.join(", "))}</div></div>`).join("");
  }
  function benderaRingkasan() {
    for (const t of ringkasan?.trigger || [])
      L.marker([t.lat, t.lon], { zIndexOffset: 1000, icon: L.divIcon({ className: "", iconSize: [30, 30], iconAnchor: [6, 30],
        html: `<div class="kedip" style="font-size:26px;line-height:30px">🚩</div>` }) })
        .bindPopup(`<b>🔴 STA ${fmtSta(t.sta_awal)} - ${fmtSta(t.sta_akhir)}</b><br>${esc(t.alasan)}<br><span class="kecil">Unit: ${esc(t.unit.join(", "))}</span>
          <div class="aksi"><a class="btn merah" target="_blank" href="${linkLapor(fmtSta(t.sta_awal), t.lat, t.lon)}">📷 Lapor + foto</a>
          <a class="btn abu" target="_blank" href="${linkNav(t.lat, t.lon)}">🧭 Navigasi</a></div>`).addTo(lapisTiket);
  }
  function pasangKlikKartu() {
    document.querySelectorAll(".kartu").forEach((k) => k.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      const ll = k.dataset.ll; if (!ll) return;
      map.setView(ll.split(",").map(Number), 16);
      if (innerWidth < 760) $("panel").classList.remove("buka");
    }));
  }

  // ---------- klik peta = lapor di titik itu ----------
  map.on("click", (e) => {
    const t = staTerdekat(e.latlng.lat, e.latlng.lng);
    if (!t || t.jarak_m > 300) return;
    const p = t.seg.properties;
    L.popup().setLatLng(e.latlng).setContent(popupSegmen(p)).openOn(map);
  });

  // ---------- lokasi saya ----------
  let penandaSaya = null;
  $("btnLokasi").onclick = () => {
    if (!navigator.geolocation) return alert("HP ini tidak mendukung lokasi");
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude: la, longitude: lo } = pos.coords, t = staTerdekat(la, lo);
      penandaSaya && penandaSaya.remove();
      const sta = t ? fmtSta((t.seg.properties.sta_awal + t.seg.properties.sta_akhir) / 2) : "?";
      penandaSaya = L.circleMarker([la, lo], { radius: 9, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).addTo(map)
        .bindPopup(`<b>Posisi saya</b><br>${t ? `Dekat STA ${sta} (${Math.round(t.jarak_m)} m dari as jalan)` : "Di luar jalur ALR"}
          <div class="aksi"><a class="btn merah" target="_blank" href="${linkLapor(sta, la, lo)}">📷 Lapor di sini</a></div>`).openPopup();
      map.setView([la, lo], 16);
    }, () => alert("Lokasi tidak bisa diambil. Izinkan akses lokasi di browser."), { enableHighAccuracy: true });
  };
  $("btnPanel").onclick = () => $("panel").classList.toggle("buka");

  // ---------- muat data ----------
  Promise.all([
    fetch("data/segmen.geojson").then((r) => r.json()),
    fetch("data/titik.geojson").then((r) => r.json()),
    fetch("data/ringkasan.json").then((r) => r.json()),
  ]).then(([seg, titik, ring]) => {
    segmen = seg.features; ringkasan = ring;
    map.fitBounds(L.geoJSON(seg).getBounds(), { padding: [20, 20] });   // set view dulu baru gambar
    gambarSegmen(); gambarTitik(titik);
    const j = ring.jumlah_segmen || {}, tgl = (s) => new Date(s.replace(" ", "T")).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
    $("info").textContent = `Data GPS ${tgl(ring.data_dari)} s/d ${tgl(ring.data_sampai)} · ${ring.n_unit} unit`;
    $("ringkas").innerHTML = `<p class="kecil">Segmen ${seg.features.length ? Math.round((seg.features[0].properties.sta_akhir - seg.features[0].properties.sta_awal) * 1000) : 200} m.
      Merah ${j.merah || 0}, kuning ${j.kuning || 0}, hijau ${j.hijau || 0}, abu ${j.abu || 0}, belum ada data ${j.kosong || 0}.<br>Dihitung ${esc(ring.dibuat)}.</p>`;
    $("listTrig").innerHTML = kartuDariRingkasan() || `<p class="kecil">Tidak ada trigger.</p>`;
    $("nTrig").textContent = (ring.trigger || []).length;
    benderaRingkasan();
    pasangKlikKartu();
    ambilTiket();
  }).catch((e) => { console.error(e.stack); $("info").textContent = "Gagal memuat data: " + e.message; });
})();
