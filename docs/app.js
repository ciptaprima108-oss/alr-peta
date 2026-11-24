// Peta Jalan ALR: segmen berwarna dari data GPS + tiket trigger/laporan dari GitHub Issues
(function () {
  // repo otomatis dari alamat GitHub Pages (owner.github.io/repo); cadangan untuk tes lokal
  const REPO_DEFAULT = "ciptaprima108-oss/alr-peta";
  const h = location.hostname.endsWith("github.io")
    ? location.hostname.split(".")[0] + "/" + location.pathname.split("/").filter(Boolean)[0]
    : REPO_DEFAULT;
  const REPO = h;
  const WARNA = { merah: "#E5341F", kuning: "#F2B705", hijau: "#3FA34D", abu: "#B8BFB7", kosong: "#5E665F" };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- peta dasar ----------
  // scroll mouse dipakai untuk menggulir halaman; zoom peta pakai tombol +/- atau klik peta dulu
  const map = L.map("map", { zoomControl: true, scrollWheelZoom: false });
  map.on("click", () => map.scrollWheelZoom.enable());
  map.on("mouseout", () => map.scrollWheelZoom.disable());
  const satelit = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Citra © Esri" });
  const jalanOSM = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" });
  satelit.addTo(map);
  const lapisSegmen = L.layerGroup().addTo(map);
  const lapisSTA = L.layerGroup().addTo(map);
  const lapisSTAkecil = L.layerGroup();               // label tiap 1 km, muncul kalau di-zoom
  map.on("zoomend", () => { if (map.getZoom() >= 14 && map.hasLayer(lapisSTA)) lapisSTAkecil.addTo(map); else lapisSTAkecil.remove(); });
  const lapisTiket = L.layerGroup().addTo(map);
  const kontrolLapis = L.control.layers({ "Satelit": satelit, "Peta jalan": jalanOSM }, { "Label STA": lapisSTA, "Tiket & laporan": lapisTiket }, { position: "topright" }).addTo(map);
  window.ALR_PETA = { map, kontrolLapis };   // dipakai cuaca.js (lapis hujan per KM)
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
    const st = { merah: "Merah: melambat / tertahan", kuning: "Kuning: agak pelan", hijau: "Hijau: lancar", abu: "Zona antre / parkir", kosong: "Belum ada data" }[p.status];
    const unit = [...new Set([...(p.unit_lambat || []), ...(p.unit_tertahan || [])])];
    return `<b>${esc(p.label)}</b><br>${st}<br>${esc(p.alasan)}<br>
      <span class="kecil">${p.n_titik} titik GPS, ${p.n_unit} unit${p.speed_median != null ? `, kecepatan umumnya ${p.speed_median} km/jam` : ""}</span>
      ${unit.length ? `<br><span class="kecil">Unit: ${esc(unit.join(", "))}</span>` : ""}
      <div class="aksi"><a class="btn merah" target="_blank" href="${linkLapor(fmtSta(p.sta_awal), p.lat, p.lon)}">Lapor + foto</a>
      <a class="btn abu" target="_blank" href="${linkNav(p.lat, p.lon)}">Navigasi</a></div>`;
  }
  function gambarSegmen() {
    lapisSegmen.clearLayers();
    // badan jalan utuh dulu (supaya tidak putus-putus), lalu warna status di atasnya; merah paling atas
    const semua = [];
    for (const f of segmen) for (const [x, y] of f.geometry.coordinates) semua.push([y, x]);
    L.polyline(semua, { color: "#1E2320", weight: 13, opacity: 0.9, interactive: false }).addTo(lapisSegmen);
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
        const ujung = p.sta === 0 || gj.features.every((g) => g.properties.jenis !== "sta" || g.properties.sta <= p.sta);
        const m = L.circleMarker([y, x], { radius: besar ? 6 : 4, color: "#111", weight: 2, fillColor: besar ? "#111" : "#fff", fillOpacity: 1 });
        if (!ujung) m.bindTooltip(besar ? `STA ${p.sta}` : String(p.sta), { permanent: true, direction: "right", className: "sta-label", offset: [6, 0] });
        m.addTo(besar ? lapisSTA : lapisSTAkecil);
      } else if (p.jenis === "pos") {
        // arah label supaya tidak saling tumpuk: BSR ke kanan-bawah, Stockpile ke kanan, 107 ke kiri-atas
        const arah = /^BSR/i.test(p.nama) ? "kanan-bawah" : /stockpile/i.test(p.nama) ? "kanan" : p.nama === "107" ? "kiri-atas" : "kanan";
        L.marker([y, x], { zIndexOffset: 500, icon: L.divIcon({ className: "", iconSize: [0, 0], iconAnchor: [0, 0],
          html: `<div class="pos-titik"></div><div class="pos-label pos-${arah}">${esc(p.nama)}</div>` }) }).addTo(map);
      } else {
        L.marker([y, x], { icon: L.divIcon({ className: "", iconSize: [30, 27], iconAnchor: [15, 14],
          html: `<svg viewBox="0 0 38 34" width="30" height="27" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))"><path d="M19 2 36 32H2z" fill="#F2B705" stroke="#23282A" stroke-width="2.5" stroke-linejoin="round"/><path d="M19 12v9M19 25v1" stroke="#23282A" stroke-width="3.5" stroke-linecap="round"/></svg>` }) })
          .bindPopup(`<b>Titik rawan</b><br>${esc(p.nama)}${p.catatan ? `<br><span class="kecil">${esc(p.catatan)}</span>` : ""}`).addTo(map);
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
      window.dispatchEvent(new CustomEvent("alr:tiket", { detail: { trig, lap } }));
    } catch (e) {
      $("listTrig").innerHTML = `<p class="kecil">Tiket belum bisa dimuat (${esc(e.message)}). Daftar di bawah dari hasil hitung GPS.</p>` + kartuDariRingkasan();
    }
  }
  const ik = (n) => `<svg class="ik"><use href="#i-${n}"/></svg>`;
  // penanda peta berbentuk pin dengan ikon, warna sesuai jenis
  const PIN_IKON = { awas: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17v.5"/>', kamera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>' };
  const pin = (warna, nama, kedip = false) => L.divIcon({ className: "", iconSize: [40, 50], iconAnchor: [20, 48], popupAnchor: [0, -44],
    html: `<div class="pin${kedip ? " kedip" : ""}"><svg viewBox="0 0 40 50" width="40" height="50"><path d="M20 48C20 48 37 30 37 18A17 17 0 0 0 3 18c0 12 17 30 17 30z" fill="${warna}" stroke="#fff" stroke-width="3"/>
      <g transform="translate(9 7) scale(.92)" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${PIN_IKON[nama]}</g></svg></div>` });
  function statusTiket(i) {
    if (i.state === "closed") return `<span class="status selesai">SELESAI</span>`;
    return i._gambar.length ? `<span class="status ada">ADA FOTO</span>` : `<span class="status belum">BELUM DICEK</span>`;
  }
  function kartu(i, jenis) {
    const lok = i._lok, ll = lok?.ll;
    const thumbs = i._gambar.slice(0, 4).map((u) => `<img src="${esc(u)}" loading="lazy" onerror="this.remove()">`).join("");
    return `<div class="kartu ${jenis} ${i.state === "closed" ? "tutup" : ""}" data-ll="${ll ? ll.join(",") : ""}">
      <span class="kgb">${ik(jenis === "lap" ? "kamera" : "awas")}</span><div>
      <b>${esc(lok?.label || i.title)}</b>${statusTiket(i)}
      <div class="baris">Tiket #${i.number}, ${new Date(i.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}, ${i._gambar.length} lampiran</div>
      ${thumbs ? `<div class="thumbs">${thumbs}</div>` : ""}
      <div class="baris"><a target="_blank" href="${i.html_url}">${jenis === "lap" ? "Buka laporan" : "Buka tiket / upload foto"}</a></div></div></div>`;
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
      const ikon = isTrig ? pin(i._gambar.length ? "#2E7D32" : "#C8321F", i._gambar.length ? "kamera" : "awas", !i._gambar.length && i.state === "open") : pin("#2a78d6", "kamera");
      L.marker(i._lok.ll, { icon: ikon, zIndexOffset: 1000 }).bindPopup(
        `<b>${esc(i.title)}</b><br>${statusTiket(i)}<br><span class="kecil">${i._gambar.length} lampiran</span>
         <div class="thumbs">${i._gambar.slice(0, 6).map((u) => `<a target="_blank" href="${esc(u)}"><img src="${esc(u)}" onerror="this.remove()"></a>`).join("")}</div>
         <div class="aksi"><a class="btn merah" target="_blank" href="${i.html_url}">${isTrig ? "Upload foto/video" : "Buka laporan"}</a>
         <a class="btn abu" target="_blank" href="${linkNav(...i._lok.ll)}">Navigasi</a></div>`).addTo(lapisTiket);
    }
    pasangKlikKartu();
  }
  function kartuDariRingkasan() {
    return (ringkasan?.trigger || []).map((t) => `<div class="kartu" data-ll="${t.lat},${t.lon}"><span class="kgb">${ik("awas")}</span><div><b>STA ${fmtSta(t.sta_awal)} - ${fmtSta(t.sta_akhir)}</b>
      <div class="baris">${esc(t.alasan)}</div><div class="baris">${ik("truk")} ${esc(t.unit.join(", "))}</div></div></div>`).join("");
  }
  function benderaRingkasan() {
    for (const t of ringkasan?.trigger || [])
      L.marker([t.lat, t.lon], { zIndexOffset: 1000, icon: pin("#C8321F", "awas", true) })
        .bindPopup(`<b>STA ${fmtSta(t.sta_awal)} - ${fmtSta(t.sta_akhir)}</b><br>${esc(t.alasan)}<br><span class="kecil">Unit: ${esc(t.unit.join(", "))}</span>
          <div class="aksi"><a class="btn merah" target="_blank" href="${linkLapor(fmtSta(t.sta_awal), t.lat, t.lon)}">Lapor + foto</a>
          <a class="btn abu" target="_blank" href="${linkNav(t.lat, t.lon)}">Navigasi</a></div>`).addTo(lapisTiket);
  }
  function pasangKlikKartu() {
    document.querySelectorAll(".kartu").forEach((k) => k.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      const ll = k.dataset.ll; if (!ll) return;
      map.setView(ll.split(",").map(Number), 16);
    }));
  }

  // dipakai layar aplikasi (aplikasi.js): geser peta ke STA tertentu
  window.ALR_keSta = (sta, zoom = 15) => { const ll = posisiSta(sta); if (ll) map.setView(ll, zoom); return ll; };
  window.ALR_linkLapor = linkLapor; window.ALR_linkNav = linkNav; window.ALR_posisiSta = (sta) => posisiSta(sta);
  window.ALR_peta = map;
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
      penandaSaya = L.circleMarker([la, lo], { radius: 9, color: "#fff", weight: 3, fillColor: "#2a78d6", fillOpacity: 1 }).addTo(map)
        .bindPopup(`<b>Posisi saya</b><br>${t ? `Dekat STA ${sta} (${Math.round(t.jarak_m)} m dari as jalan)` : "Di luar jalur ALR"}
          <div class="aksi"><a class="btn merah" target="_blank" href="${linkLapor(sta, la, lo)}">Lapor di sini</a></div>`).openPopup();
      map.setView([la, lo], 16);
    }, () => alert("Lokasi tidak bisa diambil. Izinkan akses lokasi di browser."), { enableHighAccuracy: true });
  };
  // ---------- pengawas (dibaca langsung dari config.json di repo, jadi langsung update tanpa deploy ulang) ----------
  const linkPengawas = (aksi, user = "", nama = "", jabatan = "") => `https://github.com/${REPO}/issues/new?` + new URLSearchParams({ template: "kelola_pengawas.yml",
    title: `[PENGAWAS] ${aksi} ${user}`.trim(), aksi, username: user, nama, jabatan, labels: "kelola-pengawas" });
  // Admin masuk sekali pakai token GitHub (disimpan hanya di browser ini), lalu tambah/hapus pengawas langsung dari app.
  const KUNCI = "alr_token";
  const ambilToken = () => { try { return localStorage.getItem(KUNCI) || ""; } catch { return ""; } };
  let ADMIN = null;
  async function gh(path, opsi = {}) {
    const r = await fetch(`https://api.github.com${path}`, { ...opsi, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${ambilToken()}`, ...(opsi.headers || {}) } });
    if (!r.ok) throw new Error(r.status === 401 ? "Token salah atau sudah kedaluwarsa" : r.status === 403 || r.status === 404 ? "Token tidak punya izin ke repo ini" : `GitHub menolak (${r.status})`);
    return r.status === 204 ? null : r.json();
  }
  function tampilAdmin(pesan = "") {
    $("adminMasuk").hidden = !!ADMIN; $("adminAktif").hidden = !ADMIN; $("formPengawas").hidden = !ADMIN; if (PENGGUNA.length) tampilPengguna();
    if (ADMIN) $("adminNama").textContent = "@" + ADMIN;
    $("adminPesan").innerHTML = pesan;
  }
  async function cekAdmin() {
    if (!ambilToken()) { ADMIN = null; return tampilAdmin(); }
    try {
      const u = await gh("/user");
      const izin = await gh(`/repos/${REPO}/collaborators/${u.login}/permission`);
      if (!["admin", "maintain", "write"].includes(izin.permission)) throw new Error(`@${u.login} bukan admin repo ini`);
      ADMIN = u.login; tampilAdmin();
    } catch (e) { ADMIN = null; tampilAdmin(`<span class="salah">${esc(e.message)}.</span>`); }
  }
  $("formToken").onsubmit = async (e) => {
    e.preventDefault();
    try { localStorage.setItem(KUNCI, $("isiToken").value.trim()); } catch {}
    $("isiToken").value = "";
    await cekAdmin();
    if (!ADMIN) try { localStorage.removeItem(KUNCI); } catch {}
  };
  $("btnKeluar").onclick = () => { try { localStorage.removeItem(KUNCI); } catch {} ADMIN = null; tampilAdmin("Sudah keluar."); };

  // ---------- pengguna (ID card) ----------
  const DIVISI = { "Pimpinan": "pim", "Road Maintenance": "rm", "Logistik": "log" };
  const AKSES_NAMA = { lihat: ["Lihat", "peta"], lapor: ["Lapor", "kamera"], kelola: ["Kelola", "orang"] };
  const AKSES_BAWAAN = { "Pimpinan": ["lihat", "lapor", "kelola"], "Road Maintenance": ["lihat", "lapor"], "Logistik": ["lihat"] };
  let PENGGUNA = [], FILTER = "Semua";
  async function kirimPengguna(aksi, d) {
    const isi = (j, v) => `### ${j}\n\n${v || "_No response_"}\n\n`;
    tampilAdmin(`Memproses ${aksi.toLowerCase()} ${esc(d.nama || d.id || "")}...`);
    try {
      const i = await gh(`/repos/${REPO}/issues`, { method: "POST", body: JSON.stringify({ title: `[PENGAWAS] ${aksi} ${d.nama || d.id}`, labels: ["kelola-pengawas"],
        body: isi("Aksi", aksi) + isi("ID", d.id) + isi("Nama", d.nama) + isi("Divisi", d.divisi) + isi("Jabatan", d.jabatan) + isi("Username GitHub", d.username) + isi("Akses", (d.akses || []).join(", ")) }) });
      for (let n = 0; n < 30; n++) {                    // tunggu bot membalas (biasanya < 1 menit)
        await new Promise((r) => setTimeout(r, 5000));
        const k = await gh(`/repos/${REPO}/issues/${i.number}/comments`);
        if (k.length) {
          const b = k[k.length - 1].body;
          tampilAdmin(`<span class="${b.startsWith("❌") ? "salah" : "oke"}">${esc(b.replace(/^[✅❌ℹ️]+\s*/u, ""))}</span>`);
          return muatPengawas();
        }
      }
      tampilAdmin(`Masih diproses. Cek lagi sebentar lagi.`);
    } catch (e) { tampilAdmin(`<span class="salah">${esc(e.message)}.</span>`); }
  }
  const aksesForm = () => [...document.querySelectorAll(".akses-pilih input:checked")].map((x) => x.value);
  const setAksesForm = (a) => document.querySelectorAll(".akses-pilih input").forEach((x) => x.checked = a.includes(x.value));
  function resetForm() {
    $("formPengawas").reset(); $("pId").value = ""; setAksesForm(AKSES_BAWAAN[$("pDiv").value]);
    $("formJudul").textContent = "Tambah pengguna baru"; $("btnSimpan").textContent = "Tambah pengguna"; $("btnBatal").hidden = true;
  }
  $("pDiv").onchange = () => { if (!$("pId").value) setAksesForm(AKSES_BAWAAN[$("pDiv").value]); };
  $("btnBatal").onclick = resetForm;
  setAksesForm(AKSES_BAWAAN[$("pDiv").value]);
  $("formPengawas").onsubmit = (e) => {
    e.preventDefault();
    const d = { id: $("pId").value, nama: $("pNama").value.trim(), divisi: $("pDiv").value, jabatan: $("pJab").value.trim(),
      username: $("pUser").value.trim().replace(/^@/, ""), akses: aksesForm() };
    if (!d.nama) return;
    kirimPengguna(d.id ? "Ubah" : "Tambah", d);
    resetForm();
  };
  $("listPengawas").onclick = (e) => {
    const u = e.target.closest("[data-ubah]");
    if (u) {
      const p = PENGGUNA.find((x) => x.id === u.dataset.ubah); if (!p) return;
      $("pId").value = p.id; $("pNama").value = p.nama || ""; $("pDiv").value = p.divisi; $("pJab").value = p.jabatan || ""; $("pUser").value = p.username || "";
      setAksesForm(p.akses || []);
      $("formJudul").textContent = `Ubah data ${p.nama} (${p.id})`; $("btnSimpan").textContent = "Simpan perubahan"; $("btnBatal").hidden = false;
      $("formPengawas").scrollIntoView({ behavior: "smooth", block: "start" }); $("pNama").focus({ preventScroll: true });
      return;
    }
    const b = e.target.closest("[data-hapus]"); if (!b) return;
    if (b.dataset.yakin) { const p = PENGGUNA.find((x) => x.id === b.dataset.hapus); return kirimPengguna("Hapus", { id: b.dataset.hapus, nama: p?.nama }); }
    b.dataset.yakin = "1"; b.textContent = "Yakin hapus?";
    setTimeout(() => { if (b.isConnected) { delete b.dataset.yakin; b.textContent = "Hapus"; } }, 4000);
  };
  $("divisiPilih").onclick = (e) => { const b = e.target.closest("[data-div]"); if (!b) return; FILTER = b.dataset.div; tampilPengguna(); };
  const LOGO = "ikon/logo_alr.png";
  function idCard(p) {
    const kode = DIVISI[p.divisi] || "pim", inisial = esc((p.nama || "?").trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase());
    const foto = p.username ? `<img class="foto" src="https://github.com/${encodeURIComponent(p.username)}.png?size=200" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'foto inisial',textContent:'${inisial}'}))">`
      : `<span class="foto inisial">${inisial}</span>`;
    return `<article class="idc idc-${kode}">
      <div class="idc-atas"><img src="${LOGO}" alt="ALR"><span>KARTU PENGGUNA</span></div>
      ${foto}
      <div class="idc-nama">${esc(p.nama)}</div>
      <div class="idc-jab">${esc(p.jabatan || "-")}</div>
      <div class="idc-div">${esc(p.divisi)}</div>
      <div class="idc-akses">${(p.akses || []).map((a) => AKSES_NAMA[a] ? `<span>${ik(AKSES_NAMA[a][1])}${AKSES_NAMA[a][0]}</span>` : "").join("")}</div>
      <div class="idc-bawah"><span class="idc-no">${esc(p.id || "")}</span><span class="idc-kode" aria-hidden="true"></span></div>
      ${ADMIN ? `<div class="idc-aksi"><button type="button" class="ubah" data-ubah="${esc(p.id)}">Ubah</button><button type="button" class="hapus" data-hapus="${esc(p.id)}">Hapus</button></div>` : ""}
    </article>`;
  }
  function tampilPengguna() {
    const jumlah = (d) => d === "Semua" ? PENGGUNA.length : PENGGUNA.filter((p) => p.divisi === d).length;
    $("divisiPilih").innerHTML = ["Semua", ...Object.keys(DIVISI)].map((d) => `<button type="button" role="tab" class="chip-d${FILTER === d ? " aktif" : ""}" data-div="${d}" aria-selected="${FILTER === d}">${d} <b>${jumlah(d)}</b></button>`).join("");
    const urut = Object.keys(DIVISI).filter((d) => FILTER === "Semua" || FILTER === d);
    $("listPengawas").innerHTML = urut.map((d) => { const x = PENGGUNA.filter((p) => p.divisi === d); return x.length ? `<h3 class="div-judul div-${DIVISI[d]}">${d}</h3><div class="idc-grid">${x.map(idCard).join("")}</div>` : (FILTER === d ? `<p class="kecil">Belum ada pengguna di divisi ${d}.</p>` : ""); }).join("")
      || `<p class="kecil">Belum ada pengguna.</p>`;
  }
  async function muatPengawas() {
    try {
      let cfg;
      if (ADMIN) try { cfg = JSON.parse(decodeURIComponent(escape(atob((await gh(`/repos/${REPO}/contents/config.json?ref=main`)).content.replace(/\n/g, ""))))); } catch {}
      if (!cfg) { const r = await fetch(`https://raw.githubusercontent.com/${REPO}/main/config.json?t=${Date.now()}`); if (!r.ok) throw new Error(r.status); cfg = await r.json(); }
      PENGGUNA = (cfg.pengguna || []).slice();
      for (const p of cfg.pengawas_github || []) { const q = typeof p === "string" ? { username: p } : p;
        PENGGUNA.push({ id: "", nama: q.nama || q.username, divisi: "Road Maintenance", jabatan: q.jabatan || "", username: q.username, akses: ["lihat", "lapor"] }); }
      tampilPengguna();
      window.ALR_PENGGUNA = PENGGUNA; window.ALR_idCard = idCard;
      window.dispatchEvent(new CustomEvent("alr:pengguna", { detail: PENGGUNA }));
    } catch (e) { $("listPengawas").innerHTML = `<p class="kecil">Daftar pengguna belum bisa dimuat.</p>`; }
  }
  cekAdmin().then(muatPengawas);
  const layarP = $("layarPengawas");
  const bukaPengawas = () => { layarP.hidden = false; document.body.classList.add("terkunci"); $("tutupPengawas").focus(); muatPengawas(); };
  const tutupPengawas = () => { layarP.hidden = true; document.body.classList.remove("terkunci"); $("btnPengawas").focus(); };
  $("btnPengawas").onclick = bukaPengawas;
  $("tutupPengawas").onclick = tutupPengawas;
  layarP.addEventListener("click", (e) => { if (e.target === layarP) tutupPengawas(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !layarP.hidden) tutupPengawas(); });
  $("legend").onclick = () => $("legend").classList.toggle("buka");

  // ---------- muat data ----------
  Promise.all([
    fetch("data/segmen.geojson", { cache: "no-cache" }).then((r) => r.json()),
    fetch("data/titik.geojson", { cache: "no-cache" }).then((r) => r.json()),
    fetch("data/ringkasan.json", { cache: "no-cache" }).then((r) => r.json()),
  ]).then(([seg, titik, ring]) => {
    segmen = seg.features; ringkasan = ring;
    map.fitBounds(L.geoJSON(seg).getBounds(), { padding: [20, 20] });   // set view dulu baru gambar
    gambarSegmen(); gambarTitik(titik);
    const j = ring.jumlah_segmen || {}, tgl = (s) => new Date(s.replace(" ", "T")).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
    $("info").textContent = `Data GPS sampai ${tgl(ring.data_sampai)}, ${ring.n_unit} unit`;
    $("ringkas").innerHTML = `<p class="kecil">Segmen ${seg.features.length ? Math.round((seg.features[0].properties.sta_akhir - seg.features[0].properties.sta_awal) * 1000) : 200} m.
      Merah ${j.merah || 0}, kuning ${j.kuning || 0}, hijau ${j.hijau || 0}, abu ${j.abu || 0}, belum ada data ${j.kosong || 0}.<br>Dihitung ${esc(ring.dibuat)}.</p>`;
    $("listTrig").innerHTML = kartuDariRingkasan() || `<p class="kecil">Tidak ada trigger.</p>`;
    $("nTrig").textContent = (ring.trigger || []).length;
    benderaRingkasan();
    window.dispatchEvent(new CustomEvent("alr:ringkasan", { detail: ring }));
    pasangKlikKartu();
    ambilTiket();
  }).catch((e) => { console.error(e.stack); $("info").textContent = "Gagal memuat data: " + e.message; });

  // ---------- versi baru: muat ulang otomatis (penting untuk ikon di layar utama HP yang suka menyimpan versi lama) ----------
  const VERSI = document.querySelector('meta[name="versi"]')?.content || "";
  async function cekVersi() {
    try {
      const v = (await (await fetch(`versi.txt?t=${Date.now()}`, { cache: "no-store" })).text()).trim();
      if (v && VERSI && v !== VERSI && sessionStorage.getItem("alr_muat_ulang") !== v) { sessionStorage.setItem("alr_muat_ulang", v); location.reload(); }
    } catch {}
  }
  cekVersi();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") cekVersi(); });
  setInterval(() => { if (document.visibilityState === "visible") cekVersi(); }, 5 * 60 * 1000);   // data GPS baru tiap 30 menit
})();
