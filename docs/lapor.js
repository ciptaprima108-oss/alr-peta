// Laporan lapangan di dalam aplikasi: Inspeksi jalan (CH GPE / WHL), Logistik (material & solar), Pekerjaan RM.
// Foto diambil langsung dari kamera, lalu diberi cap tanggal, jam, lokasi GPS, STA, dan nama pelapor.
// Terkirim lewat relay (Google Apps Script yang menyimpan token, bukan di aplikasi) atau token admin di HP ini.
// Kalau belum bisa terkirim (sinyal hilang), laporan disimpan di HP dan dikirim otomatis nanti.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const simpan = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
                   set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } } };
  const fmtSta = (s) => window.ALR_fmtSta ? window.ALR_fmtSta(s) : String(s);
  const koma = (v) => String(v).replace(".", ",");
  const WIB = (d) => new Date(d).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(/\./g, ":") + " WIB";
  const klik = () => window.ALR_klik?.();
  const toast = (a, b) => window.ALR_toast?.(a, b);
  const REPO = () => window.ALR_REPO || "ciptaprima108-oss/alr-peta";
  const CABANG_FOTO = "laporan-foto";

  // ---------- pilihan isian (bisa ditambah di sini) ----------
  const JENIS = {
    inspeksi: { nama: "Inspeksi jalan", label: "laporan-jalan", tag: "INSPEKSI", ikon: "inspeksi" },
    logistik: { nama: "Logistik", label: "logistik", tag: "LOGISTIK", ikon: "logistik" },
    rm: { nama: "Pekerjaan RM", label: "pekerjaan-rm", tag: "PEKERJAAN RM", ikon: "rm" },
  };
  const TIM_INSPEKSI = ["CH GPE", "WHL", "ALR", "Lainnya"];
  const TIM_LOGISTIK = ["Logistik", "RM", "CH GPE", "WHL", "ALR", "Lainnya"];
  const KENDALA = ["Licin / becek", "Berlubang / bergelombang", "Genangan air", "Amblas / longsor", "Tanjakan berat / unit selip",
    "Unit terjebak / tertahan", "Drainase tersumbat", "Debu tebal", "Tanggul / rambu rusak", "Jalan normal (trigger palsu)"];
  const TINGKAT = ["Ringan", "Sedang", "Berat, perlu segera"];
  const STATUS_LOG = ["Permintaan", "Dikirim", "Diterima"];
  const BARANG = { "Batu krokos": "m³", "Sirtu": "m³", "Tanah timbun": "m³", "Batu split": "m³", "Solar": "liter", "Oli / pelumas": "liter",
    "Gorong-gorong": "batang", "Geotextile": "roll", "Karung pasir": "karung", "Lainnya": "unit" };
  const SATUAN = ["m³", "rit", "ton", "liter", "batang", "roll", "karung", "unit"];
  const KAPAN = ["Hari ini", "Besok", "Minggu ini"];
  const KEGIATAN = ["Grading / perataan", "Timbun & tambal lubang", "Pemadatan (compact)", "Bersihkan drainase / parit", "Siram jalan (water truck)",
    "Buang lumpur", "Pasang / bersihkan gorong-gorong", "Perbaiki tanggul / safety berm", "Pasang rambu", "Lainnya"];
  const ALAT = ["Motor grader", "Excavator", "Vibro / compactor", "Water truck", "Dump truck", "Bulldozer", "Wheel loader", "Lainnya"];
  const STATUS_RM = ["Selesai", "Lanjut besok"];

  // ---------- data tiket (dari app.js) ----------
  let TRIG = [], LAP = [];
  const bacaData = (teks) => [...String(teks || "").matchAll(/<!-- alr (\{.*?\}) -->/g)].map((m) => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);

  // ---------- GPS ----------
  let gps = null, jaga = null;
  function mulaiGps() {
    if (!navigator.geolocation || jaga != null) return;
    jaga = navigator.geolocation.watchPosition((p) => { gps = { lat: p.coords.latitude, lon: p.coords.longitude, akurasi: Math.round(p.coords.accuracy), t: Date.now() }; tampilLokasi(); },
      () => { gps = gps || { gagal: true }; tampilLokasi(); }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
  }
  function hentiGps() { if (jaga != null) navigator.geolocation.clearWatch(jaga); jaga = null; }

  // ---------- keadaan form ----------
  let st = null;
  function lokasiSekarang() {
    if (gps && gps.lat != null && gps.akurasi <= 150) {
      const t = window.ALR_staTerdekat?.(gps.lat, gps.lon);
      return { lat: gps.lat, lon: gps.lon, akurasi: gps.akurasi, sumber: "gps", sta: t && t.jarak_m <= 600 ? t.sta : null, luar: !t || t.jarak_m > 600 };
    }
    if (st?.ll) return { lat: st.ll[0], lon: st.ll[1], sumber: st.trigger ? "trigger" : "peta", sta: st.sta };
    if (st?.sta != null) { const ll = window.ALR_posisiSta?.(st.sta); return { lat: ll?.[0], lon: ll?.[1], sumber: "peta", sta: st.sta }; }
    return null;
  }
  function tampilLokasi() {
    const el = $("lpLok"); if (!el || !st) return;
    const l = lokasiSekarang();
    let h;
    if (l?.sumber === "gps") h = `<b>${l.sta != null ? "HP di STA " + fmtSta(l.sta) : "HP di luar jalur ALR"}</b><span>Posisi GPS HP sekarang, akurat ${l.akurasi} m</span>`;
    else if (l) h = `<b>${l.sta != null ? "STA " + fmtSta(l.sta) : "Lokasi dari peta"}</b><span>${gps?.gagal ? "GPS HP mati, pakai lokasi " : "Mencari GPS HP... sementara pakai lokasi "}${l.sumber === "trigger" ? "trigger" : "yang dipilih"}</span>`;
    else h = `<b>${gps?.gagal ? "GPS HP belum aktif" : "Mencari GPS..."}</b><span>${gps?.gagal ? "Izinkan lokasi di pengaturan HP, atau isi STA di bawah." : "Tunggu sebentar di luar ruangan."}</span>`;
    el.innerHTML = `<svg class="ik"><use href="#i-peta"/></svg><div>${h}</div>`;
    el.classList.toggle("oke", l?.sumber === "gps");
    // isi STA otomatis kalau masih kosong
    if (l?.sta != null) ["lpSta", "lpSta1"].forEach((id) => { const i = $(id); if (i && !i.value && !i.dataset.diubah) i.value = (Math.round(l.sta * 10) / 10).toFixed(1); });
    cekBeda();
  }
  // kalau STA yang diisi beda jauh dari posisi HP, beri tahu dan tawarkan pakai posisi HP
  function cekBeda() {
    const l = lokasiSekarang(), inp = $("lpSta") || $("lpSta1"), el = $("lpBeda"); if (!el || !inp) return;
    const v = parseFloat(String(inp.value).replace(",", "."));
    const beda = l?.sumber === "gps" && l.sta != null && isFinite(v) && Math.abs(v - l.sta) >= 0.2;
    el.hidden = !beda;
    if (beda) el.innerHTML = `Laporan dicatat di <b>STA ${fmtSta(v)}</b>, bukan di posisi HP. <button type="button" id="lpPakaiHp">Pakai STA ${fmtSta(l.sta)}</button>`;
  }

  // ---------- potongan form ----------
  const pilih = (f, ops, { multi = false, nilai = [] } = {}) => `<div class="pilih" data-f="${f}"${multi ? " data-multi" : ""}>${ops.map((o) =>
    `<button type="button" data-v="${esc(o)}" class="${nilai.includes(o) ? "aktif" : ""}">${esc(o)}</button>`).join("")}</div>`;
  const bag = (judul, isi, extra = "") => `<fieldset class="lp-bag" ${extra}><legend>${judul}</legend>${isi}</fieldset>`;
  const slotFoto = (slot, judul, maks, wajib) => `<div class="lp-foto" data-slot="${slot}" data-maks="${maks}">
      <div class="lp-foto-j">${judul}${wajib ? ' <em>wajib</em>' : ""}</div><div class="lp-thumbs"></div>
      <label class="lp-kamera"><input type="file" accept="image/*" capture="environment" hidden><svg class="ik"><use href="#i-kamera"/></svg><span>Ambil foto</span></label></div>`;
  function opsiTrigger() {
    const buka = TRIG.filter((i) => i.state === "open");
    if (!buka.length && !st.trigger) return "";
    return bag("Terkait trigger jalan merah", `<select id="lpTrig" class="lp-input"><option value="">Tidak terkait trigger</option>${
      buka.map((i) => `<option value="${i.number}"${i.number === st.trigger ? " selected" : ""}>#${i.number} ${esc(i._lok?.label || i.title.replace(/^\[TRIGGER\]\s*/i, ""))}</option>`).join("")}${
      st.trigger && !buka.some((i) => i.number === st.trigger) ? `<option value="${st.trigger}" selected>#${st.trigger}</option>` : ""}</select>`);
  }
  function siapa(timList, timAwal) {
    const saya = (window.ALR_PENGGUNA || []).find((p) => (p.id || p.nama) === simpan.get("alr_saya", ""));
    const nama = simpan.get("alr_lapor_nama", "") || saya?.nama || "";
    const daftar = (window.ALR_PENGGUNA || []).map((p) => `<option value="${esc(p.nama)}">`).join("");
    return bag("Siapa yang lapor", `<input id="lpNama" class="lp-input" list="lpNamaList" placeholder="Nama kamu" value="${esc(nama)}" autocomplete="name"><datalist id="lpNamaList">${daftar}</datalist>
      ${timList ? `<div class="lp-sub">Tim</div>${pilih("tim", timList, { nilai: [timList.includes(timAwal) ? timAwal : "Lainnya"] })}<input id="lpTimLain" class="lp-input lp-lain" placeholder="Tulis nama tim" value="${esc(timList.includes(timAwal) || !timAwal ? "" : timAwal)}" hidden>` : ""}`);
  }
  const lokasi = (dua) => bag("Lokasi", `<div class="lp-lokasi" id="lpLok"></div>
    ${dua ? `<div class="lp-dua"><label>Dari STA<input id="lpSta1" class="lp-input" inputmode="decimal" placeholder="16.0"></label><label>Sampai STA<input id="lpSta2" class="lp-input" inputmode="decimal" placeholder="16.8"></label></div>`
      : `<label class="lp-kecil-l">STA lokasi kejadian (km, boleh diubah)<input id="lpSta" class="lp-input" inputmode="decimal" placeholder="contoh 16.5"></label>`}<p class="lp-beda" id="lpBeda" hidden></p>`);
  const catatan = (ph) => bag("Catatan", `<textarea id="lpCatatan" class="lp-input" rows="3" placeholder="${esc(ph)}"></textarea>`);

  function formHtml(j) {
    const timAwal = simpan.get("alr_lapor_tim_" + j, null);
    if (j === "inspeksi") return siapa(TIM_INSPEKSI, timAwal || "CH GPE") + lokasi() +
      bag("Kendala di jalan", pilih("kendala", KENDALA, { multi: true }) + `<div class="lp-sub">Seberapa parah</div>` + pilih("tingkat", TINGKAT, { nilai: ["Sedang"] })) +
      bag("Foto bukti", slotFoto("umum", "Foto kondisi jalan", 4, true)) + catatan("contoh: licin sepanjang 50 m habis hujan, 2 DT selip") + opsiTrigger() +
      `<label class="lp-cek" id="lpTutupWrap" hidden><input type="checkbox" id="lpTutup"> Tutup trigger ini, jalan ternyata normal</label>`;
    if (j === "logistik") {
      const minta = LAP.filter((i) => i.state === "open" && i._d?.jenis === "logistik" && i._d.status === "Permintaan");
      return bag("Jenis laporan", pilih("status", STATUS_LOG, { nilai: ["Permintaan"] }) +
          `<p class="lp-ket" data-untuk="Permintaan">Minta barang ke Logistik.</p><p class="lp-ket" data-untuk="Dikirim" hidden>Barang sudah jalan dari gudang.</p><p class="lp-ket" data-untuk="Diterima" hidden>Barang sudah sampai di lokasi. Permintaannya otomatis ditutup.</p>`) +
        `<div data-untuk="Dikirim Diterima" hidden>${bag("Untuk permintaan yang mana", `<select id="lpMinta" class="lp-input"><option value="">Bukan dari permintaan di aplikasi</option>${minta.map((i) =>
          `<option value="${i.number}">#${i.number} ${esc(i._d.jumlah)} ${esc(i._d.satuan)} ${esc(i._d.barang)}, STA ${fmtSta(i._d.sta ?? 0)}</option>`).join("")}</select>`)}</div>` +
        siapa(TIM_LOGISTIK, timAwal || "RM") +
        bag("Barang", pilih("barang", Object.keys(BARANG), { nilai: ["Batu krokos"] }) + `<input id="lpBarangLain" class="lp-input" placeholder="Nama barang lain" hidden>
          <div class="lp-dua"><label>Jumlah<input id="lpJumlah" class="lp-input lp-besar" inputmode="decimal" placeholder="0"></label><label>Satuan<select id="lpSatuan" class="lp-input">${SATUAN.map((s) => `<option${s === "m³" ? " selected" : ""}>${s}</option>`).join("")}</select></label></div>`) +
        lokasi() +
        `<div data-untuk="Permintaan">${bag("Dibutuhkan kapan", pilih("kapan", KAPAN, { nilai: ["Hari ini"] }))}</div>` +
        `<div data-untuk="Dikirim Diterima" hidden>${bag("Pengantar", `<input id="lpUnit" class="lp-input" placeholder="contoh: DT 07, sopir Andi, no. surat jalan">`)}</div>` +
        bag("Foto", slotFoto("umum", "Foto barang / surat jalan", 3, false)) + catatan("contoh: untuk timbun lubang KM 14, 4 rit") + opsiTrigger();
    }
    return siapa(null) + `<input type="hidden" id="lpOperatorTim" value="RM">` +
      bag("Operator", `<input id="lpOperator" class="lp-input" placeholder="Nama operator, contoh: Joko (grader)">`) + lokasi(true) +
      bag("Kegiatan", pilih("kegiatan", KEGIATAN, { multi: true }) + `<input id="lpKegLain" class="lp-input lp-lain" placeholder="Tulis kegiatan lain" hidden>`) +
      bag("Alat yang dipakai", pilih("alat", ALAT, { multi: true }) + `<div id="lpAlatNo" class="lp-alat-no"></div>`) +
      bag("Jam kerja", `<div class="lp-dua"><label>Mulai<input id="lpMulai" type="time" class="lp-input"></label><label>Selesai<input id="lpSelesai" type="time" class="lp-input"></label></div>`) +
      bag("Material yang dipakai", pilih("barang", ["Tidak pakai", ...Object.keys(BARANG).filter((b) => !["Solar", "Oli / pelumas"].includes(b))], { nilai: ["Tidak pakai"] }) +
        `<input id="lpBarangLain" class="lp-input" placeholder="Nama material lain" hidden>
        <div class="lp-dua" id="lpJumlahWrap" hidden><label>Jumlah<input id="lpJumlah" class="lp-input lp-besar" inputmode="decimal" placeholder="0"></label><label>Satuan<select id="lpSatuan" class="lp-input">${SATUAN.map((s) => `<option${s === "m³" ? " selected" : ""}>${s}</option>`).join("")}</select></label></div>`) +
      bag("Foto sebelum dan sesudah", slotFoto("sebelum", "Sebelum dikerjakan", 2, false) + slotFoto("sesudah", "Sesudah dikerjakan", 2, true)) +
      bag("Status pekerjaan", pilih("status", STATUS_RM, { nilai: ["Selesai"] })) + catatan("contoh: grading 800 m, timbun 3 lubang, besok lanjut drainase") + opsiTrigger() +
      `<label class="lp-cek" id="lpTutupWrap" hidden><input type="checkbox" id="lpTutup" checked> Tutup trigger ini, jalan sudah baik</label>`;
  }

  // ---------- buka form ----------
  window.ALR_lapor = function (jenis = "inspeksi", o = {}) {
    const c = JENIS[jenis] || JENIS.inspeksi;
    st = { jenis, trigger: o.trigger ? +o.trigger : null, sta: o.sta != null && o.sta !== "" ? +o.sta : null, ll: o.ll || null, foto: { umum: [], sebelum: [], sesudah: [] } };
    if (st.trigger && !st.ll) { const t = TRIG.find((i) => i.number === st.trigger); if (t?._lok) { st.ll = t._lok.ll; st.sta = st.sta ?? t._lok.sta; } }
    $("laporJudul").textContent = c.nama;
    $("laporGb").innerHTML = window.ALR_ikon3d?.(c.ikon) || ""; $("laporGb").className = "lyr-gb gb3d";
    const f = $("laporForm");
    f.innerHTML = `<div class="lp-hero lp-${jenis}"><span>${window.ALR_ikon3d?.(c.ikon) || ""}</span><div><b>${c.nama}</b><small>${
      { inspeksi: "Cek jalan rusak, licin, atau unit tertahan. Foto langsung dari kamera, jam dan lokasi tercatat otomatis.",
        logistik: "Minta, kirim, dan terima material atau solar untuk jalan.", rm: "Catat pekerjaan perbaikan jalan hari ini, dengan foto sebelum dan sesudah." }[jenis]}</small></div></div>
      <div class="lp-salah" id="lpSalah" hidden></div>${formHtml(jenis)}
      <button type="submit" class="lp-kirim" id="lpKirim"><svg class="ik"><use href="#i-kirim"/></svg>Kirim laporan</button>
      <p class="lp-catat">Foto otomatis diberi cap tanggal, jam, lokasi GPS, STA, dan nama pelapor.</p>`;
    if (st.sta != null) { const i = $("lpSta") || $("lpSta1"); if (i) i.value = (Math.round(st.sta * 10) / 10).toFixed(1); }
    if ($("lpSelesai")) $("lpSelesai").value = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });
    gps = null; mulaiGps(); tampilLokasi(); aturTampil();
    window.ALR_tutupSheet?.(); window.ALR_peta?.closePopup?.();
    window.ALR_buka("lapor");
  };
  window.addEventListener("alr:layar", (e) => { if (e.detail.aktif !== "lapor") hentiGps(); });

  // ---------- isi form: pilihan, foto ----------
  const nilai = (f) => [...$("laporForm").querySelectorAll(`.pilih[data-f="${f}"] button.aktif`)].map((b) => b.dataset.v);
  const kodeAlat = (a) => ({ "Motor grader": "MG", "Excavator": "EX", "Vibro / compactor": "VB", "Water truck": "WT", "Dump truck": "DT", "Bulldozer": "BD", "Wheel loader": "WL" }[a] || "XX");
  function aturTampil() {
    const f = $("laporForm"); if (!f || !st) return;
    const status = nilai("status")[0] || "";
    f.querySelectorAll("[data-untuk]").forEach((el) => el.hidden = !el.dataset.untuk.split(" ").includes(status));
    const b = nilai("barang")[0];
    if ($("lpBarangLain")) $("lpBarangLain").hidden = b !== "Lainnya";
    if ($("lpJumlahWrap")) $("lpJumlahWrap").hidden = !b || b === "Tidak pakai";
    if ($("lpTimLain")) $("lpTimLain").hidden = nilai("tim")[0] !== "Lainnya";
    if ($("lpKegLain")) $("lpKegLain").hidden = !nilai("kegiatan").includes("Lainnya");
    const an = $("lpAlatNo");
    if (an) {
      const lama = {}; an.querySelectorAll("[data-alat]").forEach((x) => { lama[x.dataset.alat] = x.querySelector(".lp-no")?.value || ""; lama[x.dataset.alat + "#"] = x.querySelector(".lp-nama")?.value || ""; });
      an.innerHTML = nilai("alat").map((a) => `<label class="lp-alat" data-alat="${esc(a)}"><span>${a === "Lainnya" ? "Alat lain" : esc(a)}</span>${a === "Lainnya" ? `<input class="lp-input lp-nama" placeholder="Nama alat" value="${esc(lama[a + "#"] || "")}">` : ""}<input class="lp-input lp-no" placeholder="No. lambung, contoh ${kodeAlat(a)}-001" autocapitalize="characters" value="${esc(lama[a] || "")}"></label>`).join("");
    }
    const trig = +($("lpTrig")?.value || 0);
    const tw = $("lpTutupWrap");
    if (tw) tw.hidden = !trig || (st.jenis === "inspeksi" ? !nilai("kendala").includes("Jalan normal (trigger palsu)") : status !== "Selesai");
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("#laporForm .pilih button"); if (!b) return;
    const g = b.parentElement; klik();
    if (g.hasAttribute("data-multi")) {
      b.classList.toggle("aktif");
      if (b.dataset.v === "Jalan normal (trigger palsu)" && b.classList.contains("aktif")) g.querySelectorAll("button").forEach((x) => x !== b && x.classList.remove("aktif"));
      else if (b.classList.contains("aktif")) g.querySelector('[data-v="Jalan normal (trigger palsu)"]')?.classList.remove("aktif");
    } else { g.querySelectorAll("button").forEach((x) => x.classList.toggle("aktif", x === b)); }
    if (g.dataset.f === "barang" && BARANG[b.dataset.v] && $("lpSatuan")) $("lpSatuan").value = BARANG[b.dataset.v];
    aturTampil();
  });
  document.addEventListener("click", (e) => {
    if (e.target.id !== "lpPakaiHp") return;
    const l = lokasiSekarang(), inp = $("lpSta") || $("lpSta1"); if (!l?.sta || !inp) return;
    klik(); inp.value = (Math.round(l.sta * 10) / 10).toFixed(1); cekBeda();
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "lpTrig") aturTampil();
    if (["lpSta", "lpSta1", "lpSta2"].includes(e.target.id)) { e.target.dataset.diubah = "1"; cekBeda(); }
    const inp = e.target.closest("#laporForm .lp-kamera input"); if (!inp || !inp.files?.[0]) return;
    const slot = inp.closest(".lp-foto"), nama = slot.dataset.slot, file = inp.files[0]; inp.value = "";
    if (st.foto[nama].length >= +slot.dataset.maks) return toast("ALR: Foto sudah penuh", `Paling banyak ${slot.dataset.maks} foto.`);
    const ket = { sebelum: "SEBELUM", sesudah: "SESUDAH" }[nama] || "";
    const tunggu = document.createElement("div"); tunggu.className = "lp-th tunggu"; slot.querySelector(".lp-thumbs").appendChild(tunggu);
    stempel(file, ket).then((f) => { st.foto[nama].push(f); tampilFoto(slot); }).catch(() => { tunggu.remove(); toast("ALR: Foto gagal dibaca", "Coba ambil foto lagi."); });
  });
  function tampilFoto(slot) {
    const nama = slot.dataset.slot;
    slot.querySelector(".lp-thumbs").innerHTML = st.foto[nama].map((f, i) => `<div class="lp-th"><img src="${f.url}" alt="Foto ${i + 1}"><button type="button" data-hapus="${i}" aria-label="Hapus foto">×</button></div>`).join("");
    slot.querySelector(".lp-kamera span").textContent = st.foto[nama].length ? "Tambah foto" : "Ambil foto";
    slot.querySelector(".lp-kamera").hidden = st.foto[nama].length >= +slot.dataset.maks;
  }
  document.addEventListener("click", (e) => {
    const h = e.target.closest("#laporForm [data-hapus]"); if (!h) return;
    const slot = h.closest(".lp-foto"); st.foto[slot.dataset.slot].splice(+h.dataset.hapus, 1); tampilFoto(slot); klik();
  });

  // ---------- cap foto: tanggal, jam, GPS, STA, nama ----------
  function bacaGambar(file) {
    return new Promise((ok, gagal) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => ok({ im, u }); im.onerror = gagal; im.src = u; });
  }
  async function stempel(file, ket) {
    const { im, u } = await bacaGambar(file);
    const sk = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
    const W = Math.round(im.naturalWidth * sk), H = Math.round(im.naturalHeight * sk);
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"); g.drawImage(im, 0, 0, W, H); URL.revokeObjectURL(u);
    const waktu = Date.now(), l = lokasiSekarang();
    const nama = ($("lpNama")?.value || "").trim(), tim = nilai("tim")[0] || (st.jenis === "rm" ? "RM" : "");
    const baris = [
      `ALR · ${JENIS[st.jenis].nama}${ket ? " · " + ket : ""}`,
      WIB(waktu),
      l?.lat != null ? `${l.sta != null ? "STA " + fmtSta(l.sta) + " · " : ""}${l.lat.toFixed(5)}, ${l.lon.toFixed(5)}${l.sumber === "gps" ? ` (±${l.akurasi} m)` : " (lokasi peta)"}` : "Lokasi GPS tidak tersedia",
      [nama, tim].filter(Boolean).join(" · ") || "Pelapor belum diisi",
    ];
    const fs = Math.max(18, Math.round(W / 28)), lh = Math.round(fs * 1.32), pad = Math.round(fs * 0.7), tinggi = lh * baris.length + pad * 2;
    g.fillStyle = "rgba(7,27,58,.72)"; g.fillRect(0, H - tinggi, W, tinggi);
    g.fillStyle = "#E11D2E"; g.fillRect(0, H - tinggi, Math.round(W * 0.5), Math.max(3, fs / 6)); g.fillStyle = "#fff"; g.fillRect(Math.round(W * 0.5), H - tinggi, W, Math.max(3, fs / 6));
    g.textBaseline = "top";
    baris.forEach((t, i) => { g.font = `${i === 0 ? 700 : 500} ${i === 0 ? Math.round(fs * 1.05) : fs}px Barlow, Arial, sans-serif`; g.fillStyle = i === 0 ? "#FFD54F" : "#fff"; g.fillText(t, pad, H - tinggi + pad + i * lh, W - pad * 2); });
    const data = c.toDataURL("image/jpeg", 0.8);
    return { url: data, b64: data.split(",")[1], waktu, lat: l?.lat ?? null, lon: l?.lon ?? null, ket };
  }

  // ---------- susun laporan ----------
  const angkaSta = (id) => { const v = parseFloat(String($(id)?.value || "").replace(",", ".")); return isFinite(v) ? v : null; };
  function susun() {
    const j = st.jenis, salah = [];
    const nama = ($("lpNama")?.value || "").trim(); if (!nama) salah.push("Isi nama pelapor.");
    let tim = j === "rm" ? "RM" : nilai("tim")[0] || "";
    if (tim === "Lainnya") { tim = ($("lpTimLain")?.value || "").trim(); if (!tim) salah.push("Tulis nama tim."); }
    const l = lokasiSekarang();
    const trig = +($("lpTrig")?.value || 0) || null;
    const rid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const d = { v: 1, rid, jenis: j, pelapor: nama, tim, waktu: new Date().toISOString(), trigger: trig, catatan: ($("lpCatatan")?.value || "").trim() };
    if (l?.sumber === "gps") Object.assign(d, { lat: +l.lat.toFixed(6), lon: +l.lon.toFixed(6), akurasi: l.akurasi });
    else if (l?.lat != null) Object.assign(d, { lat: +l.lat.toFixed(6), lon: +l.lon.toFixed(6), lokasi_dari: l.sumber });
    let foto = [], judul = "", baris = [];
    const barang = () => { const b = nilai("barang")[0]; return b === "Lainnya" ? ($("lpBarangLain")?.value || "").trim() || "Barang lain" : b; };
    if (j === "inspeksi") {
      d.sta = angkaSta("lpSta") ?? l?.sta ?? null; d.kendala = nilai("kendala"); d.tingkat = nilai("tingkat")[0] || "";
      if (!d.kendala.length) salah.push("Pilih minimal satu kendala.");
      if (!st.foto.umum.length) salah.push("Ambil minimal satu foto.");
      foto = st.foto.umum;
      judul = `[INSPEKSI] STA ${d.sta != null ? fmtSta(d.sta) : "?"}: ${d.kendala.join(", ")}`;
      baris = [["Kendala", d.kendala.join(", ")], ["Tingkat", d.tingkat]];
      d.tutup_trigger = !!(trig && $("lpTutup")?.checked && d.kendala.includes("Jalan normal (trigger palsu)"));
    } else if (j === "logistik") {
      d.status = nilai("status")[0]; d.barang = barang(); d.jumlah = parseFloat(String($("lpJumlah").value).replace(",", ".")) || 0; d.satuan = $("lpSatuan").value;
      d.sta = angkaSta("lpSta") ?? l?.sta ?? null;
      if (!d.jumlah) salah.push("Isi jumlah barang.");
      if (d.status === "Permintaan") d.kapan = nilai("kapan")[0] || "";
      else { d.permintaan = +($("lpMinta")?.value || 0) || null; d.pengantar = ($("lpUnit")?.value || "").trim(); if (d.status === "Diterima" && !st.foto.umum.length) salah.push("Ambil foto barang yang sampai."); }
      foto = st.foto.umum;
      judul = `[LOGISTIK] ${d.status} ${koma(d.jumlah)} ${d.satuan} ${d.barang}${d.sta != null ? " ke STA " + fmtSta(d.sta) : ""}`;
      baris = [["Status", d.status], ["Barang", `${koma(d.jumlah)} ${d.satuan} ${d.barang}`], ["Dibutuhkan", d.kapan], ["Pengantar", d.pengantar], ["Untuk permintaan", d.permintaan ? "#" + d.permintaan : ""]];
    } else {
      d.sta1 = angkaSta("lpSta1") ?? l?.sta ?? null; d.sta2 = angkaSta("lpSta2"); d.sta = d.sta1;
      d.operator = ($("lpOperator")?.value || "").trim(); d.kegiatan = nilai("kegiatan").map((k) => k === "Lainnya" ? ($("lpKegLain")?.value || "").trim() : k).filter(Boolean);
      if (nilai("kegiatan").includes("Lainnya") && !($("lpKegLain")?.value || "").trim()) salah.push("Tulis kegiatan lainnya.");
      d.alat = [...document.querySelectorAll("#lpAlatNo [data-alat]")].map((x) => { const nm = x.dataset.alat === "Lainnya" ? (x.querySelector(".lp-nama")?.value || "").trim() || "Alat lain" : x.dataset.alat; const no = (x.querySelector(".lp-no")?.value || "").trim().toUpperCase(); return no ? `${nm} ${no}` : nm; });
      d.mulai = $("lpMulai").value; d.selesai = $("lpSelesai").value; d.status = nilai("status")[0] || "";
      const b = barang(); if (b && b !== "Tidak pakai") { d.barang = b; d.jumlah = parseFloat(String($("lpJumlah").value).replace(",", ".")) || 0; d.satuan = $("lpSatuan").value; }
      if (!d.kegiatan.length) salah.push("Pilih minimal satu kegiatan.");
      if (!st.foto.sesudah.length) salah.push("Ambil foto sesudah dikerjakan.");
      foto = [...st.foto.sebelum, ...st.foto.sesudah];
      const rentang = d.sta1 != null ? `STA ${fmtSta(d.sta1)}${d.sta2 != null ? " - " + fmtSta(d.sta2) : ""}` : "STA ?";
      judul = `[PEKERJAAN RM] ${rentang}: ${d.kegiatan.join(", ")}`;
      baris = [["Kegiatan", d.kegiatan.join(", ")], ["Alat", d.alat.join(", ")], ["Operator", d.operator], ["Jam kerja", d.mulai || d.selesai ? `${d.mulai || "?"} sampai ${d.selesai || "?"}` : ""],
        ["Material", d.barang ? `${koma(d.jumlah)} ${d.satuan} ${d.barang}` : ""], ["Status", d.status]];
      d.tutup_trigger = !!(trig && d.status === "Selesai" && $("lpTutup")?.checked);
    }
    d.foto_ket = foto.map((f) => f.ket || "");
    const lokTeks = d.lat != null ? `${d.sta != null ? "STA " + fmtSta(d.sta) + ", " : ""}koordinat ${d.lat}, ${d.lon}${d.akurasi ? ` (GPS HP ±${d.akurasi} m)` : " (lokasi dari peta)"}` : d.sta != null ? `STA ${fmtSta(d.sta)}` : "-";
    const json = JSON.stringify(d).replace(/--/g, "\\u002d\\u002d");
    const isi = `<!-- alr ${json} -->\n### ${esc(JENIS[j].nama)}\n\n` +
      [["Pelapor", `${nama}${tim ? " (" + tim + ")" : ""}`], ["Waktu", WIB(d.waktu)], ["Lokasi", lokTeks], ...baris, ["Catatan", d.catatan], ["Trigger", trig ? "#" + trig : ""]]
        .filter(([, v]) => v).map(([k, v]) => `**${k}:** ${String(v).replace(/[<>]/g, "")}  `).join("\n") + "\n\n{{FOTO}}\n\n_Dikirim dari aplikasi ALR_";
    // paket: buat tiket baru, atau tambah ke permintaan logistik yang sudah ada
    const paket = { versi: 1, rid, foto: foto.map((f, i) => ({ b64: f.b64, ket: f.ket || `Foto ${i + 1}` })), komentar: [] };
    if (j === "logistik" && d.permintaan) paket.komentar.push({ nomor: d.permintaan, isi, tutup: d.status === "Diterima" });
    else paket.baru = { label: JENIS[j].label, judul: judul.slice(0, 200), isi };
    if (trig) {
      const ringkas = { inspeksi: `Sudah dicek ${nama} (${tim})`, logistik: `${d.status} material: ${koma(d.jumlah)} ${d.satuan} ${d.barang}`, rm: `Dikerjakan RM: ${(d.kegiatan || []).join(", ")}, status ${d.status}` }[j];
      paket.komentar.push({ nomor: trig, isi: `<!-- alr ${JSON.stringify({ v: 1, jenis: j, status: d.status || "", tahap: true, pelapor: nama, tim, waktu: d.waktu, laporan: paket.baru ? "{{NOMOR}}" : d.permintaan }).replace(/--/g, "\\u002d\\u002d")} -->\n**${ringkas}.** Laporan lengkap: #{{NOMOR}}\n\n{{FOTO}}`, tutup: !!d.tutup_trigger });
    }
    return { salah, paket, judul, nama, tim };
  }

  // ---------- kirim ----------
  let CFG = null; const TERKIRIM = "alr_terkirim";
  const muatCfg = () => CFG || (CFG = fetch("lapor.json", { cache: "no-cache" }).then((r) => r.ok ? r.json() : {}).catch(() => ({})));
  async function lewatToken(p) {
    const gh = window.ALR_gh, R = REPO(), bln = new Date().toISOString().slice(0, 7);
    const url = [];
    for (const f of p.foto) {
      const path = `foto/${bln}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.jpg`;
      await gh(`/repos/${R}/contents/${path}`, { method: "PUT", body: JSON.stringify({ message: "Foto laporan ALR", content: f.b64, branch: CABANG_FOTO }) });
      url.push(`https://raw.githubusercontent.com/${R}/${CABANG_FOTO}/${path}`);
    }
    const fotoMd = url.map((u, i) => `![${p.foto[i].ket}](${u})`).join("\n");
    let nomor = null;
    if (p.baru) nomor = (await gh(`/repos/${R}/issues`, { method: "POST", body: JSON.stringify({ title: p.baru.judul, body: p.baru.isi.replace("{{FOTO}}", fotoMd), labels: [p.baru.label] }) })).number;
    for (const k of p.komentar) {
      await gh(`/repos/${R}/issues/${k.nomor}/comments`, { method: "POST", body: JSON.stringify({ body: k.isi.replace("{{FOTO}}", fotoMd).replace(/\{\{NOMOR\}\}/g, nomor ?? k.nomor) }) });
      if (k.tutup) await gh(`/repos/${R}/issues/${k.nomor}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "completed" }) });
      nomor = nomor ?? k.nomor;
    }
    return nomor;
  }
  async function lewatRelay(url, p) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(p) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.pesan || "relay menolak");
    if (j.nomor) return j.nomor;
    const t = simpan.get(TERKIRIM, []); t.push({ rid: p.rid, judul: (p.baru?.judul || "Update laporan"), waktu: Date.now() }); simpan.set(TERKIRIM, t.slice(-30));
    return "antre";
  }
  async function kirimPaket(p) {
    if (!navigator.onLine) throw new Error("offline");
    const cfg = await muatCfg();
    let hasil;
    if (window.ALR_adaToken?.()) { try { hasil = await lewatToken(p); } catch (e) { if (!cfg.relay) throw e; } }
    if (hasil === undefined && cfg.relay) hasil = await lewatRelay(cfg.relay, p);
    if (hasil === undefined) throw new Error("belum-ada-jalur");
    keDatabase(p, hasil); // salinan ke Supabase; "antre" juga berarti relay sudah terima
    return hasil;
  }
  // Tahap 1 Supabase: salin laporan ke tabel "laporan". Gagal di sini tidak membatalkan laporan.
  function keDatabase(p, nomor) {
    if (!window.ALR_db) return;
    try {
      const sumber = p.baru?.isi || p.komentar?.[0]?.isi || "";
      const m = sumber.match(/<!-- alr (.*?) -->/s); if (!m) return;
      const d = JSON.parse(m[1]);
      const jenis = ["inspeksi", "logistik", "rm"].includes(d.jenis) ? d.jenis : { "laporan-jalan": "inspeksi", logistik: "logistik", "pekerjaan-rm": "rm" }[p.baru?.label] || (p.baru ? "lainnya" : "logistik");
      const angka = (v) => (v == null || v === "" || isNaN(+v) ? null : +v);
      window.ALR_db.aktif().then((ok) => ok && window.ALR_db.simpanLaporan({
        rid: p.rid || null, jenis, judul: (p.baru?.judul || `[LOGISTIK] Update permintaan #${d.permintaan || "?"}`).slice(0, 200),
        pelapor: (d.pelapor || d.nama || "").slice(0, 80) || null, tim: (d.tim || "").slice(0, 60) || null,
        sta: angka(d.sta), lat: angka(d.lat), lon: angka(d.lon), status: d.status || null,
        trigger_no: angka(d.trigger), tiket_no: typeof nomor === "number" ? nomor : angka(d.permintaan),
        sumber: "aplikasi", waktu: d.waktu ? new Date(d.waktu).toISOString() : new Date().toISOString(), data: d,
      })).catch((e) => console.warn("ALR db:", e.message));
    } catch (e) { console.warn("ALR db:", e.message); }
  }

  // ---------- antrean di HP (kalau belum terkirim) ----------
  const ANTRE = "alr_antrean";
  function tampilAntre() {
    const el = $("antrean"); if (!el) return;
    const a = simpan.get(ANTRE, []);
    const sudah = new Set(LAP.map((i) => i._d?.rid).filter(Boolean));
    const proses = simpan.get(TERKIRIM, []).filter((x) => !sudah.has(x.rid) && Date.now() - x.waktu < 2 * 864e5);
    simpan.set(TERKIRIM, proses);
    el.hidden = !a.length && !proses.length;
    el.innerHTML = proses.map((x) => `<div class="lp-antre lp-proses"><span class="lp-putar"></span><div><b>${esc(x.judul.replace(/^\[[A-Z ]+\]\s*/, ""))}</b><span>Terkirim ${WIB(x.waktu)}. Sedang diproses, muncul di daftar dalam 5 sampai 15 menit.</span></div></div>`).join("") + (a.length ? `<div class="lp-antre"><svg class="ik"><use href="#i-jam"/></svg><div><b>${a.length} laporan belum terkirim</b><span>Tersimpan di HP ini. Dikirim otomatis saat ada sinyal.</span></div>
      <button type="button" id="btnKirimAntre">Kirim sekarang</button></div>` : "");
  }
  async function kirimAntre(diam) {
    const a = simpan.get(ANTRE, []); if (!a.length) return;
    const sisa = [];
    for (const x of a) { try { await kirimPaket(x.paket); } catch (e) { sisa.push(x); } }
    simpan.set(ANTRE, sisa); tampilAntre();
    if (sisa.length < a.length) { toast("ALR: Laporan terkirim", `${a.length - sisa.length} laporan dari HP ini sudah masuk.`); setTimeout(() => window.ALR_muatTiket?.(), 3000); }
    else if (!diam) toast("ALR: Belum bisa kirim", "Coba lagi nanti saat sinyal bagus.");
  }
  document.addEventListener("click", (e) => { if (e.target.closest("#btnKirimAntre")) { klik(); kirimAntre(false); } });
  window.addEventListener("online", () => kirimAntre(true));
  setTimeout(() => { tampilAntre(); kirimAntre(true); }, 4000);

  async function bagikan(judul, foto) {
    try {
      const files = await Promise.all(foto.map(async (f, i) => new File([await (await fetch(f.url)).blob()], `ALR-${i + 1}.jpg`, { type: "image/jpeg" })));
      if (navigator.canShare?.({ files })) return navigator.share({ files, text: judul });
      return navigator.share?.({ text: judul });
    } catch {}
  }

  $("laporForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { salah, paket, judul, nama, tim } = susun();
    const box = $("lpSalah");
    if (salah.length) { box.hidden = false; box.innerHTML = `<b>Belum bisa dikirim:</b><ul>${salah.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`; box.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    box.hidden = true;
    simpan.set("alr_lapor_nama", nama); if (tim) simpan.set("alr_lapor_tim_" + st.jenis, tim);
    const btn = $("lpKirim"); btn.disabled = true; btn.innerHTML = `<span class="lp-putar"></span>Mengirim...`;
    const foto = [...st.foto.umum, ...st.foto.sebelum, ...st.foto.sesudah];
    try {
      const no = await kirimPaket(paket);
      selesai(true, no === "antre" ? "Laporan terkirim" : `Laporan terkirim (nomor ${no})`, no === "antre" ? "Muncul di Laporan lapangan dan Kotak masuk dalam 5 sampai 15 menit." : "Sudah masuk ke Laporan lapangan dan Kotak masuk.", judul, foto);
      tampilAntre();
      window.ALR_umumkan?.("ALR, laporan terkirim");
      setTimeout(() => window.ALR_muatTiket?.(), 4000);
    } catch (err) {
      const a = simpan.get(ANTRE, []); a.push({ judul, waktu: Date.now(), paket });
      const ok = simpan.set(ANTRE, a); tampilAntre();
      const sebab = err.message === "belum-ada-jalur" ? "Jalur kirim laporan belum disambungkan oleh admin." : err.message === "offline" ? "Tidak ada sinyal." : "Server belum bisa dihubungi.";
      selesai(false, ok ? "Laporan disimpan di HP" : "Laporan belum terkirim", `${sebab} ${ok ? "Akan dikirim otomatis nanti." : "Memori HP penuh, bagikan ke WhatsApp dulu."} Bisa juga dibagikan ke grup WhatsApp sekarang.`, judul, foto);
    }
  });
  function selesai(ok, judul, isi, teks, foto) {
    $("laporForm").innerHTML = `<div class="lp-selesai ${ok ? "oke" : "tunda"}"><span class="lp-centang"><svg class="ik"><use href="#i-${ok ? "cek" : "jam"}"/></svg></span>
      <h3>${esc(judul)}</h3><p>${esc(isi)}</p>
      ${foto.length ? `<div class="lp-thumbs">${foto.map((f) => `<div class="lp-th"><img src="${f.url}" alt=""></div>`).join("")}</div>` : ""}
      <div class="lp-tombol">${!ok || navigator.share ? `<button type="button" id="lpBagi" class="lp-abu"><svg class="ik"><use href="#i-kirim"/></svg>Bagikan ke WhatsApp</button>` : ""}
      <button type="button" id="lpKeLap" class="lp-biru">Lihat laporan lapangan</button><button type="button" id="lpLagi" class="lp-abu">Buat laporan lagi</button></div></div>`;
    $("lpBagi") && ($("lpBagi").onclick = () => bagikan(teks, foto));
    $("lpKeLap").onclick = () => { klik(); window.ALR_buka("laporan"); };
    const j = st.jenis, o = { trigger: st.trigger, sta: st.sta, ll: st.ll };
    $("lpLagi").onclick = () => window.ALR_lapor(j, o);
    hentiGps();
  }

  // ---------- tombol "lapor" di mana saja (kartu trigger, peta, pop-up KM, beranda) ----------
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lapor]"); if (!b) return;
    e.preventDefault(); e.stopPropagation(); klik();
    window.ALR_lapor(b.dataset.lapor, { trigger: b.dataset.trig, sta: b.dataset.sta, ll: b.dataset.ll ? b.dataset.ll.split(",").map(Number) : null });
  }, true);

  // ---------- daftar laporan lapangan & trigger di aplikasi ----------
  const IKON_J = { inspeksi: "inspeksi", logistik: "logistik", rm: "rm" };
  const jenisDari = (i) => i._d?.jenis || (i.labels.some((l) => l.name === "logistik") ? "logistik" : i.labels.some((l) => l.name === "pekerjaan-rm") ? "rm" : "inspeksi");
  function statusLap(i) {
    const j = jenisDari(i), up = i._up?.length ? i._up[i._up.length - 1] : null, s = up?.status || i._d?.status;
    if (j === "logistik") return s === "Diterima" || i.state === "closed" ? ["Diterima", "hijau"] : s === "Dikirim" ? ["Dikirim", "biru"] : ["Diminta", "kuning"];
    if (j === "rm") return s === "Lanjut besok" ? ["Lanjut besok", "kuning"] : ["Selesai", "hijau"];
    const t = i._d?.tingkat; return t?.startsWith("Berat") ? ["Berat", "merah"] : t === "Ringan" ? ["Ringan", "hijau"] : ["Sedang", "kuning"];
  }
  function isiLap(i) {
    const d = i._d; if (!d) return `<p class="lp-k-isi">${esc(i.title.replace(/^\[[A-Z ]+\]\s*/, ""))}</p>`;
    const chip = (a) => (a || []).map((x) => `<span class="lp-chip">${esc(x)}</span>`).join("");
    if (d.jenis === "inspeksi") return `<div class="lp-chips">${chip(d.kendala)}</div>${d.catatan ? `<p class="lp-k-isi">${esc(d.catatan)}</p>` : ""}`;
    if (d.jenis === "logistik") return `<p class="lp-k-besar">${koma(d.jumlah)} ${esc(d.satuan)} <b>${esc(d.barang)}</b></p><p class="lp-k-isi">${d.sta != null ? "Ke STA " + fmtSta(d.sta) : ""}${d.kapan ? `, dibutuhkan ${esc(d.kapan.toLowerCase())}` : ""}${d.catatan ? `. ${esc(d.catatan)}` : ""}</p>${
      (i._up || []).map((u) => `<p class="lp-k-up"><svg class="ik"><use href="#i-cek"/></svg>${esc(u.status)} oleh ${esc(u.pelapor)}, ${WIB(u.waktu)}</p>`).join("")}`;
    return `<div class="lp-chips">${chip(d.kegiatan)}</div><p class="lp-k-isi">${[d.alat?.length ? "Alat: " + d.alat.join(", ") : "", d.operator ? "Operator: " + d.operator : "", d.mulai || d.selesai ? `Jam ${d.mulai || "?"} sampai ${d.selesai || "?"}` : "", d.barang ? `Material: ${koma(d.jumlah)} ${d.satuan} ${d.barang}` : ""].filter(Boolean).map(esc).join(". ")}</p>${d.catatan ? `<p class="lp-k-isi">${esc(d.catatan)}</p>` : ""}`;
  }
  let SARING = "semua", PER = { p: "7", dari: null, sampai: null };
  const tglIso = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  function rentang() {
    const hari = tglIso(Date.now());
    if (PER.p === "rentang") return [PER.dari || "2000-01-01", PER.sampai || hari];
    const d = new Date(Date.now() + 7 * 36e5); d.setUTCDate(d.getUTCDate() - (+PER.p - 1));
    return [d.toISOString().slice(0, 10), hari];
  }
  const waktuLap = (i) => i._d?.waktu || i.created_at;
  function terpilih() {
    const [a, b] = rentang();
    return LAP.filter((i) => (SARING === "semua" || jenisDari(i) === SARING) && tglIso(waktuLap(i)) >= a && tglIso(waktuLap(i)) <= b);
  }
  const teksPeriode = () => { const [a, b] = rentang(), f = (x) => new Date(x + "T12:00:00+07:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }); return a === b ? f(a) : `${f(a)} sampai ${f(b)}`; };
  function kartuLap(i) {
    const j = jenisDari(i), d = i._d, [st1, w] = statusLap(i), ll = i._lok?.ll;
    const lok = d?.jenis === "rm" && d.sta1 != null ? `STA ${fmtSta(d.sta1)}${d.sta2 != null ? " - " + fmtSta(d.sta2) : ""}` : d?.sta != null ? `STA ${fmtSta(d.sta)}` : i._lok?.label || "";
    const foto = i._gambar.slice(0, 4).map((u, n) => `<button type="button" class="lp-th" data-lihat-foto="${esc(u)}"><img src="${esc(u)}" loading="lazy" alt="" onerror="this.parentNode.remove()">${d?.foto_ket?.[n] ? `<i>${esc(d.foto_ket[n])}</i>` : ""}</button>`).join("");
    const bisaUpdate = j === "logistik" && i.state === "open" && d;
    return `<article class="lp-kartu j-${j}" data-n="${i.number}" ${ll ? `data-ll="${ll.join(",")}"` : ""}>
      <div class="lp-k-atas"><span class="lp-k-gb">${window.ALR_ikon3d?.(IKON_J[j]) || ""}</span><div><b>${esc(JENIS[j].nama)}${lok ? " · " + esc(lok) : ""}</b>
        <small>${d ? `${esc(d.pelapor)}${d.tim ? " (" + esc(d.tim) + ")" : ""}, ` : ""}${WIB(d?.waktu || i.created_at)}</small></div><span class="lp-status s-${w}">${esc(st1)}</span></div>
      ${isiLap(i)}${foto ? `<div class="lp-thumbs">${foto}</div>` : ""}
      <div class="lp-k-aksi">${ll ? `<button type="button" data-ke-peta="${ll.join(",")}"><svg class="ik"><use href="#i-peta"/></svg>Peta</button>` : ""}${
        d?.trigger ? `<span class="lp-k-trig">Trigger #${d.trigger}</span>` : ""}${
        bisaUpdate ? `<button type="button" class="utama" data-update-log="${i.number}"><svg class="ik"><use href="#i-truk"/></svg>${statusLap(i)[0] === "Dikirim" ? "Tandai diterima" : "Tandai dikirim"}</button>` : ""}</div></article>`;
  }
  function tampilLap() {
    const el = $("listLap"); if (!el) return;
    const daftar = terpilih();
    if ($("lapJumlah")) $("lapJumlah").textContent = `${daftar.length} laporan, ${teksPeriode()}`;
    el.innerHTML = daftar.length ? daftar.map(kartuLap).join("") : `<div class="kosong-besar kecil-k"><span class="kb-gb">${window.ALR_ikon3d?.("laporan") || ""}</span><h3>Belum ada laporan</h3><p>Pencet salah satu tombol di atas untuk buat laporan pertama.</p></div>`;
  }
  document.addEventListener("click", (e) => {
    const s = e.target.closest(".lap-saring [data-saring]");
    if (s) { klik(); SARING = s.dataset.saring; document.querySelectorAll(".lap-saring button").forEach((b) => b.classList.toggle("aktif", b === s)); tampilLap(); return; }
    const pr = e.target.closest(".lap-periode [data-lp]");
    if (pr) { klik(); PER.p = pr.dataset.lp; document.querySelectorAll(".lap-periode button").forEach((b) => b.classList.toggle("aktif", b === pr)); $("lapRentang").hidden = PER.p !== "rentang";
      if (PER.p === "rentang" && !$("lapDari").value) { const [a, b] = [tglIso(Date.now() - 6 * 864e5), tglIso(Date.now())]; $("lapDari").value = a; $("lapSampai").value = b; PER.dari = a; PER.sampai = b; }
      tampilLap(); return; }
    const ek = e.target.closest("[data-ekspor]");
    if (ek) { klik(); ekspor(ek.dataset.ekspor, ek); return; }
    const u = e.target.closest("[data-update-log]");
    if (u) {
      const i = LAP.find((x) => x.number === +u.dataset.updateLog); if (!i) return;
      klik(); window.ALR_lapor("logistik", { sta: i._d.sta, trigger: i._d.trigger });
      const tujuan = statusLap(i)[0] === "Dikirim" ? "Diterima" : "Dikirim";
      document.querySelector(`#laporForm .pilih[data-f="status"] [data-v="${tujuan}"]`)?.click();
      if ($("lpMinta")) $("lpMinta").value = i.number;
      document.querySelector(`#laporForm .pilih[data-f="barang"] [data-v="${CSS.escape(i._d.barang)}"]`)?.click();
      $("lpJumlah").value = i._d.jumlah; $("lpSatuan").value = i._d.satuan;
      return;
    }
    const p = e.target.closest("[data-ke-peta]");
    if (p) { klik(); const ll = p.dataset.kePeta.split(",").map(Number); window.ALR_tutupSemua?.(); setTimeout(() => { window.ALR_peta?.setView(ll, 16); window.scrollTo({ top: 0, behavior: "smooth" }); }, 300); return; }
    const f = e.target.closest("[data-lihat-foto]");
    if (f) { klik(); lihatFoto(f.dataset.lihatFoto); return; }
    const l = e.target.closest("[data-lihat-lap]");
    if (l) { klik(); window.ALR_peta?.closePopup?.(); SARING = "semua"; window.ALR_buka("laporan"); setTimeout(() => { const k = document.querySelector(`.lp-kartu[data-n="${l.dataset.lihatLap}"]`); k?.scrollIntoView({ behavior: "smooth", block: "center" }); k?.classList.add("sorot"); }, 400); return; }
    const k = e.target.closest(".lyr .kartu[data-ll]");
    if (k && !e.target.closest("a,button")) { const ll = k.dataset.ll.split(",").map(Number); setTimeout(() => window.ALR_peta?.setView(ll, 16), 340); }
  });
  document.addEventListener("change", (e) => { if (e.target.id === "lapDari" || e.target.id === "lapSampai") { PER.dari = $("lapDari").value; PER.sampai = $("lapSampai").value; tampilLap(); } });

  // ---------- ekspor: Excel, PDF, JPG ----------
  const muatJs = (u) => new Promise((ok, gagal) => { if (document.querySelector(`script[src="${u}"]`)) return ok(); const s = document.createElement("script"); s.src = u; s.onload = ok; s.onerror = gagal; document.head.appendChild(s); });
  const LIB = { xlsx: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", h2c: "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", pdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" };
  function baris(i) {
    const d = i._d || {}, j = jenisDari(i), w = new Date(waktuLap(i)), up = (i._up || []).slice(-1)[0];
    const lok = j === "rm" && d.sta1 != null ? `${fmtSta(d.sta1)}${d.sta2 != null ? " - " + fmtSta(d.sta2) : ""}` : d.sta != null ? fmtSta(d.sta) : (i._lok?.label || "").replace("STA ", "");
    return { "No": i.number, "Jenis": JENIS[j].nama, "Tanggal": w.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric" }),
      "Jam (WIB)": w.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).replace(".", ":"), "Pelapor": d.pelapor || "", "Tim": d.tim || "", "STA": lok,
      "Kendala / kegiatan": (d.kendala || d.kegiatan || []).join(", ") || (d.barang && j === "logistik" ? d.barang : ""), "Tingkat / status": statusLap(i)[0],
      "Barang / material": d.barang || "", "Jumlah": d.jumlah ?? "", "Satuan": d.satuan || "", "Alat": (d.alat || []).join(", "), "Operator": d.operator || "",
      "Jam kerja": d.mulai || d.selesai ? `${d.mulai || "?"} - ${d.selesai || "?"}` : "", "Catatan": d.catatan || "", "Trigger": d.trigger ? "#" + d.trigger : "",
      "Update terakhir": up ? `${up.status} oleh ${up.pelapor}` : "", "Koordinat": d.lat != null ? `${d.lat}, ${d.lon}` : "", "Foto": i._gambar.join(" ") };
  }
  const namaFile = (ext) => `Laporan ALR ${SARING === "semua" ? "semua" : JENIS[SARING].nama} ${rentang().join(" sd ")}.${ext}`;
  function unduh(blob, nama) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nama; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
  function rekapEl(daftar) {
    const el = document.createElement("div"); el.className = "rekap";
    const hit = (j) => daftar.filter((i) => jenisDari(i) === j).length;
    el.innerHTML = `<div class="rk-atas"><img src="ikon/icon-192.png" alt=""><div><b>Rekap Laporan Lapangan ALR</b><span>${esc(teksPeriode())} · ${SARING === "semua" ? "Semua jenis" : esc(JENIS[SARING].nama)}</span></div></div>
      <div class="rk-angka"><div><b>${daftar.length}</b>laporan</div><div><b>${hit("inspeksi")}</b>inspeksi</div><div><b>${hit("logistik")}</b>logistik</div><div><b>${hit("rm")}</b>pekerjaan RM</div></div>
      <table><thead><tr><th>Foto</th><th>Waktu</th><th>Jenis</th><th>STA</th><th>Isi</th><th>Pelapor</th><th>Status</th></tr></thead><tbody>${daftar.map((i) => { const b = baris(i);
        return `<tr><td>${i._gambar[0] ? `<img src="${esc(i._gambar[0])}" crossorigin="anonymous" alt="">` : ""}</td><td>${b.Tanggal}<br>${b["Jam (WIB)"]}</td><td>${esc(b.Jenis)}</td><td>${esc(b.STA)}</td>
          <td>${esc([b["Kendala / kegiatan"], b["Barang / material"] && b.Jenis !== "Logistik" ? "Material: " + b["Jumlah"] + " " + b.Satuan + " " + b["Barang / material"] : b.Jenis === "Logistik" ? b.Jumlah + " " + b.Satuan : "", b.Alat && "Alat: " + b.Alat, b.Catatan].filter(Boolean).join(". "))}</td>
          <td>${esc(b.Pelapor)}${b.Tim ? "<br><small>" + esc(b.Tim) + "</small>" : ""}</td><td>${esc(b["Tingkat / status"])}</td></tr>`; }).join("")}</tbody></table>
      <p class="rk-kaki">Dibuat dari aplikasi ALR, ${WIB(Date.now())}</p>`;
    document.body.appendChild(el); return el;
  }
  async function gambarRekap(daftar) {
    await muatJs(LIB.h2c);
    const el = rekapEl(daftar);
    await Promise.all([...el.querySelectorAll("img")].map((im) => im.complete ? 0 : new Promise((ok) => { im.onload = im.onerror = ok; })));
    try { return await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" }); } finally { el.remove(); }
  }
  async function ekspor(jenis, tombol) {
    const daftar = terpilih();
    if (!daftar.length) return toast("ALR: Tidak ada laporan", "Coba ganti rentang waktu atau jenis laporan.");
    const asli = tombol.innerHTML; tombol.disabled = true; tombol.innerHTML = `<span class="lp-putar"></span>`;
    try {
      if (jenis === "xlsx") {
        await muatJs(LIB.xlsx);
        const wb = XLSX.utils.book_new(), tambah = (nama, d) => { const ws = XLSX.utils.json_to_sheet(d.map(baris)); ws["!cols"] = Object.keys(baris(d[0] || daftar[0])).map((k) => ({ wch: Math.min(40, Math.max(8, k.length + 2)) })); XLSX.utils.book_append_sheet(wb, ws, nama); };
        tambah("Semua", daftar);
        for (const j of ["inspeksi", "logistik", "rm"]) { const d = daftar.filter((i) => jenisDari(i) === j); if (d.length) tambah(JENIS[j].nama, d); }
        XLSX.writeFile(wb, namaFile("xlsx"));
      } else {
        const c = await gambarRekap(daftar);
        if (jenis === "jpg") await new Promise((ok) => c.toBlob((b) => { unduh(b, namaFile("jpg")); ok(); }, "image/jpeg", 0.9));
        else {
          await muatJs(LIB.pdf);
          const pdf = new jspdf.jsPDF({ unit: "mm", format: "a4" }), W = 190, hHal = 277, pxPerMm = c.width / W, potong = Math.floor(hHal * pxPerMm);
          for (let y = 0, hal = 0; y < c.height; y += potong, hal++) {
            const tinggi = Math.min(potong, c.height - y), k = document.createElement("canvas"); k.width = c.width; k.height = tinggi;
            k.getContext("2d").drawImage(c, 0, y, c.width, tinggi, 0, 0, c.width, tinggi);
            if (hal) pdf.addPage();
            pdf.addImage(k.toDataURL("image/jpeg", 0.88), "JPEG", 10, 10, W, tinggi / pxPerMm);
          }
          pdf.save(namaFile("pdf"));
        }
      }
      toast("ALR: File siap", `${daftar.length} laporan disimpan ke HP.`);
    } catch (err) { toast("ALR: Gagal membuat file", "Cek sinyal lalu coba lagi."); }
    finally { tombol.disabled = false; tombol.innerHTML = asli; }
  }

  function lihatFoto(u) {
    const v = document.createElement("div"); v.className = "lp-penampil"; v.innerHTML = `<img src="${esc(u)}" alt="Foto laporan"><button type="button" aria-label="Tutup">×</button>`;
    v.onclick = () => { v.classList.remove("tampil"); setTimeout(() => v.remove(), 250); };
    document.body.appendChild(v); requestAnimationFrame(() => v.classList.add("tampil"));
  }

  // trigger: tampilkan tahap alur dan tombol lapor
  const TAHAP = [["inspeksi", "Dicek"], ["logistik", "Material"], ["rm", "Dikerjakan"], ["tutup", "Selesai"]];
  function kartuTrig(i) {
    const ll = i._lok?.ll, sta = i._lok?.sta, data = bacaData(i._teks);
    const terkait = LAP.filter((x) => x._d?.trigger === i.number).map((x) => jenisDari(x));
    const ada = new Set([...data.map((x) => x.jenis), ...terkait]); if (i.state === "closed") ada.add("tutup");
    const alasan = (i.body || "").match(/\*\*Alasan:\*\*\s*([^\n]+)/)?.[1]?.replace(/\s+$/, "") || "";
    const unit = (i.body || "").match(/\*\*Unit:\*\*\s*([^\n]+)/)?.[1]?.trim() || "";
    const btn = (j, t) => `<button type="button" data-lapor="${j}" data-trig="${i.number}" data-sta="${sta ?? ""}" ${ll ? `data-ll="${ll.join(",")}"` : ""}><span>${window.ALR_ikon3d?.(j) || ""}</span>${t}</button>`;
    return `<div class="kartu trig lp-trig ${i.state === "closed" ? "tutup" : ""}" ${ll ? `data-ll="${ll.join(",")}"` : ""}>
      <span class="kgb"><svg class="ik"><use href="#i-awas"/></svg></span><div>
      <b>${esc(i._lok?.label || i.title.replace(/^\[TRIGGER\]\s*/i, ""))}</b>${i.state === "closed" ? '<span class="status selesai">SELESAI</span>' : ""}
      <div class="baris">Trigger #${i.number}, ${WIB(i.created_at)}</div>
      ${alasan ? `<div class="baris">${esc(alasan)}</div>` : ""}${unit ? `<div class="baris"><svg class="ik"><use href="#i-truk"/></svg> ${esc(unit)}</div>` : ""}
      <ol class="lp-tahap">${TAHAP.map(([k, t]) => `<li class="${ada.has(k) ? "ok" : ""}"><i></i>${t}</li>`).join("")}</ol>
      ${i._gambar.length ? `<div class="lp-thumbs">${i._gambar.slice(0, 4).map((u) => `<button type="button" class="lp-th" data-lihat-foto="${esc(u)}"><img src="${esc(u)}" loading="lazy" alt="" onerror="this.parentNode.remove()"></button>`).join("")}</div>` : ""}
      ${i.state === "open" ? `<div class="lp-trig-aksi">${btn("inspeksi", "Lapor cek")}${btn("logistik", "Minta material")}${btn("rm", "Lapor kerja")}</div>` : ""}</div></div>`;
  }
  window.addEventListener("alr:tiket", (e) => {
    TRIG = e.detail.trig || []; LAP = e.detail.lap || [];
    for (const i of LAP) { const all = bacaData(i._teks || i.body); i._d = all[0] || null; i._up = all.slice(1).filter((x) => !x.tahap); if (!i._lok?.ll && i._d?.lat != null) i._lok = { ll: [i._d.lat, i._d.lon], sta: i._d.sta, label: i._d.sta != null ? "STA " + fmtSta(i._d.sta) : "Lokasi" }; }
    tampilLap(); tampilAntre();
    const lt = $("listTrig");
    if (lt && TRIG.length) lt.innerHTML = [...TRIG].sort((a, b) => (a.state === "open" ? 0 : 1) - (b.state === "open" ? 0 : 1)).map(kartuTrig).join("");
  });
})();
