// Layar "Database laporan": baca tabel laporan di Supabase, saring, cari, buka detail, unduh Excel (CSV).
(() => {
  const $ = (id) => document.getElementById(id);
  const el = $("dbIsi"); if (!el) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const klik = () => window.ALR_klik?.();
  const JENIS = { inspeksi: { n: "Inspeksi", w: "#E11D2E" }, logistik: { n: "Logistik", w: "#D27A00" }, rm: { n: "Pekerjaan RM", w: "#0B4EA2" },
    hse: { n: "HSE", w: "#7A3FD1" }, traffic: { n: "Traffic", w: "#0F8A5F" }, alat: { n: "Alat & BBM", w: "#5B6B80" }, humas: { n: "Humas", w: "#B3478A" }, lainnya: { n: "Lainnya", w: "#5B6B80" } };
  const PERIODE = [["1", "Hari ini"], ["7", "7 hari"], ["30", "30 hari"], ["semua", "Semua"]];
  const LABEL = { pelapor: "Pelapor", tim: "Tim", waktu: "Waktu", sta: "STA", sta1: "Dari STA", sta2: "Sampai STA", kendala: "Kendala", tingkat: "Tingkat",
    status: "Status", barang: "Barang", jumlah: "Jumlah", satuan: "Satuan", kapan: "Dibutuhkan", pengantar: "Pengantar", permintaan: "Untuk permintaan",
    kegiatan: "Kegiatan", alat: "Alat", operator: "Operator", mulai: "Jam mulai", selesai: "Jam selesai", catatan: "Catatan", trigger: "Trigger jalan merah",
    akurasi: "Akurasi GPS (m)", tutup_trigger: "Trigger ditutup" };
  const LEWATI = new Set(["v", "rid", "jenis", "lat", "lon", "lokasi_dari", "foto_ket"]);
  const st = { data: [], jenis: "semua", periode: "7", cari: "", buka: null, muat: false, salah: "", tindak: false, mode: "kartu", urut: "waktu", turun: true };
  try { st.mode = localStorage.getItem("alr_db_mode") || "kartu"; } catch {}
  const WARNA_STATUS = { Permintaan: "#D27A00", Dikirim: "#1565C0", Diterima: "#1E8E3E", Selesai: "#1E8E3E", "Lanjut besok": "#C2410C" };
  // perlu tindak lanjut: material belum sampai, kerja RM belum beres, temuan inspeksi berat
  const perluTindak = (r) => (r.jenis === "logistik" && ["Permintaan", "Dikirim"].includes(r.status)) || (r.jenis === "rm" && r.status === "Lanjut besok") ||
    (r.jenis === "inspeksi" && /berat/i.test(r.data?.tingkat || ""));
  const tglKey = (t) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

  const WIB = (t) => new Date(t).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(".", ":");
  const sta = (v) => v == null || v === "" ? "–" : Number(v).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const nilai = (v) => Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Ya" : "Tidak") : String(v);
  const judul = (r) => r.judul.replace(/^\[[A-Z ]+\]\s*/, "");

  async function muat() {
    if (!window.ALR_db) { st.salah = "Sambungan database belum terpasang di aplikasi."; return gambar(); }
    st.muat = true; st.salah = ""; gambar();
    try {
      // ambil 2x rentang supaya bisa dibandingkan dengan rentang sebelumnya (kemarin / minggu lalu)
      const lebar = st.periode === "semua" ? 0 : +st.periode === 1 ? jamHariIni() : +st.periode * 864e5;
      const batas = Date.now() - lebar, sejak = lebar ? `&waktu=gte.${new Date(batas - (+st.periode === 1 ? 864e5 : lebar)).toISOString()}` : "";
      const semua = await window.ALR_db.minta(`laporan?select=*&order=waktu.desc&limit=4000${sejak}`) || [];
      st.data = lebar ? semua.filter((r) => new Date(r.waktu) >= batas) : semua;
      st.lalu = lebar ? semua.length - st.data.length : null;
    } catch (e) { st.salah = /belum-diatur/.test(e.message) ? "Database belum disambungkan oleh admin." : !navigator.onLine ? "Tidak ada sinyal. Coba lagi saat ada sinyal." : "Database belum bisa dihubungi. Coba muat ulang."; }
    st.muat = false; gambar();
  }
  // "Hari ini" = sejak jam 00.00 WIB
  function jamHariIni() { const s = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })); return (s.getHours() * 60 + s.getMinutes()) * 6e4 + s.getSeconds() * 1e3; }

  function tersaring() {
    const q = st.cari.trim().toLowerCase();
    const out = st.data.filter((r) => (st.jenis === "semua" || r.jenis === st.jenis) && (!st.tindak || perluTindak(r)) &&
      (!q || [r.judul, r.pelapor, r.tim, r.status, sta(r.sta), JSON.stringify(r.data)].join(" ").toLowerCase().includes(q)));
    const k = st.urut, arah = st.turun ? -1 : 1;
    const v = (r) => k === "sta" ? (r.sta ?? -1) : k === "jenis" ? (JENIS[r.jenis]?.n || "") : k === "pelapor" ? (r.pelapor || "").toLowerCase() : k === "status" ? (r.status || "") : k === "judul" ? judul(r).toLowerCase() : r.waktu;
    return out.sort((a, b) => (v(a) > v(b) ? 1 : v(a) < v(b) ? -1 : 0) * arah);
  }
  // grafik batang laporan per hari (paling banyak 14 hari terakhir)
  // ringkasan: A angka besar + B lampu status (pengganti grafik batang)
  const beres = (r) => ["Selesai", "Diterima"].includes(r.status);
  const berjalan = (r) => (r.jenis === "logistik" && ["Permintaan", "Dikirim"].includes(r.status)) || (r.jenis === "rm" && r.status === "Lanjut besok");
  const mendesak = (r) => r.jenis === "inspeksi" && /berat/i.test(r.data?.tingkat || "");
  function grafik() {
    // satu baris angka kecil, sisanya langsung daftar laporan
    const d = st.data, hariIni = tglKey(Date.now());
    const nHari = d.filter((r) => tglKey(r.waktu) === hariIni).length, nT = d.filter(perluTindak).length, nB = d.filter(beres).length;
    const nama = { "1": "Hari ini", "7": "7 hari", "30": "30 hari", semua: "Total" }[st.periode];
    return `<div class="db-strip">
      <div><b>${nHari}</b><span>Hari ini</span></div>
      <button type="button" data-db-aksi="tindak" class="${st.tindak ? "aktif" : ""}" aria-pressed="${st.tindak}"><b class="${nT ? "db-naik" : ""}">${nT}</b><span>Perlu tindak lanjut</span></button>
      <div><b class="db-turun">${nB}</b><span>Beres</span></div></div>`;
  }
  function kelompok(rows) {
    if (st.urut !== "waktu") return rows.map(baris).join("");
    const hariIni = tglKey(Date.now()), kemarin = tglKey(Date.now() - 864e5); let akhir = "", out = "";
    rows.forEach((r) => { const k = tglKey(r.waktu); if (k !== akhir) { akhir = k;
      const n = rows.filter((x) => tglKey(x.waktu) === k).length;
      out += `<h3 class="db-tgl"><span>${k === hariIni ? "Hari ini" : k === kemarin ? "Kemarin" : new Date(k + "T12:00:00+07:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}</span><small>${n} laporan</small></h3>`; }
      out += baris(r); });
    return out;
  }
  function tabel(rows) {
    const kol = [["waktu", "Tanggal"], ["jenis", "Jenis"], ["sta", "STA"], ["judul", "Isi laporan"], ["pelapor", "Pelapor"], ["status", "Status"]];
    return `<div class="db-tabel-bungkus"><table class="db-tabel"><thead><tr>${kol.map(([k, n]) => `<th><button type="button" data-db-urut="${k}" class="${st.urut === k ? "aktif" : ""}">${n}${st.urut === k ? (st.turun ? " ▼" : " ▲") : ""}</button></th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr data-db-baris="${r.id}" style="--w:${(JENIS[r.jenis] || JENIS.lainnya).w}"><td>${WIB(r.waktu)}</td><td><span class="db-jenis">${esc((JENIS[r.jenis] || JENIS.lainnya).n)}</span></td><td class="db-angka">${sta(r.sta)}</td><td>${esc(judul(r))}</td><td>${esc(r.pelapor || "")}</td><td>${r.status ? `<span class="db-status" style="--s:${WARNA_STATUS[r.status] || "var(--w)"}">${esc(r.status)}</span>` : ""}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function gambar() {
    const hit = { semua: st.data.length }; st.data.forEach((r) => hit[r.jenis] = (hit[r.jenis] || 0) + 1);
    const tab = ["semua", "inspeksi", "logistik", "rm", ...Object.keys(hit).filter((k) => !["semua", "inspeksi", "logistik", "rm"].includes(k))];
    const rows = tersaring(), nTindak = st.data.filter(perluTindak).length;
    window.ALR_DB_RINGKAS = st.muat ? "Memuat..." : st.salah ? st.salah : `${st.data.length} laporan ${{ "1": "hari ini", "7": "dalam 7 hari terakhir", "30": "dalam 30 hari terakhir", semua: "tersimpan" }[st.periode]}.`;
    window.ALR_isiHero?.("database");
    el.innerHTML = `
      <div class="db-pita" role="group" aria-label="Jenis laporan">${tab.map((k) => `<button type="button" data-db-jenis="${k}" class="${st.jenis === k ? "aktif" : ""}" style="--w:${k === "semua" ? "var(--rb-biru)" : (JENIS[k]?.w || "#5B6B80")}">
        <b>${hit[k] || 0}</b><span>${k === "semua" ? "Semua" : k === "rm" ? "RM" : esc(JENIS[k]?.n || k)}</span></button>`).join("")}</div>
      <div class="db-alat">
        <div class="db-periode" role="group" aria-label="Rentang waktu">${PERIODE.map(([v, n]) => `<button type="button" data-db-per="${v}" class="${st.periode === v ? "aktif" : ""}">${n}</button>`).join("")}</div>
        <label class="db-cari"><svg class="ik"><use href="#i-cari"/></svg><input type="search" id="dbCari" placeholder="Cari nama, STA, barang, kegiatan" value="${esc(st.cari)}"></label>
        <div class="db-baris2"><button type="button" class="db-tindak${st.tindak ? " aktif" : ""}" data-db-aksi="tindak" aria-pressed="${st.tindak}">${st.tindak ? "Tampilkan semua laporan" : "Hanya yang perlu tindak lanjut"}</button>
          <div class="db-mode" role="group" aria-label="Tampilan"><button type="button" data-db-mode="kartu" class="${st.mode === "kartu" ? "aktif" : ""}">Kartu</button><button type="button" data-db-mode="tabel" class="${st.mode === "tabel" ? "aktif" : ""}">Tabel</button></div></div>
        <div class="db-tombol"><span>${rows.length} laporan</span><button type="button" data-db-aksi="muat">Muat ulang</button><button type="button" data-db-aksi="csv" ${rows.length ? "" : "disabled"}><b class="xl">X</b>Unduh Excel</button></div>
      </div>
      <div class="db-daftar" aria-live="polite">${st.muat ? `<p class="db-kosong">Memuat database...</p>` : st.salah ? `<p class="db-kosong db-salah">${esc(st.salah)}</p>` :
        !rows.length ? `<p class="db-kosong">${st.data.length ? "Tidak ada laporan yang cocok. Coba hapus kata pencarian atau pilih jenis lain." : "Belum ada laporan di rentang waktu ini. Pilih rentang yang lebih panjang."}</p>` :
        st.mode === "tabel" ? tabel(rows) : kelompok(rows)}</div>`;
    const c = $("dbCari"); c.oninput = () => { st.cari = c.value; const pos = c.selectionStart; gambar(); const n = $("dbCari"); n.focus(); n.setSelectionRange(pos, pos); };
  }

  function baris(r) {
    const j = JENIS[r.jenis] || JENIS.lainnya, terbuka = st.buka === r.id;
    return `<article class="db-baris${terbuka ? " buka" : ""}" style="--w:${j.w}">
      <button type="button" class="db-kepala" data-db-id="${r.id}" aria-expanded="${terbuka}">
        <span class="db-sta"><small>STA</small><b>${sta(r.sta)}</b></span>
        <span class="db-teks"><b>${esc(judul(r))}</b><small>${esc(j.n)} · ${esc(r.pelapor || "Tanpa nama")}${r.tim ? " (" + esc(r.tim) + ")" : ""} · ${WIB(r.waktu)}</small></span>
        ${r.status ? `<span class="db-status" style="--s:${WARNA_STATUS[r.status] || "var(--w)"}">${esc(r.status)}</span>` : perluTindak(r) ? `<span class="db-status" style="--s:#E11D2E">Berat</span>` : ""}
      </button>
      ${terbuka ? detail(r) : ""}</article>`;
  }
  function detail(r) {
    const d = r.data || {};
    const isi = Object.entries(d).filter(([k, v]) => !LEWATI.has(k) && v !== null && v !== "" && !(Array.isArray(v) && !v.length))
      .map(([k, v]) => [LABEL[k] || k.replace(/_/g, " "), k === "waktu" ? WIB(v) : k === "sta" || k === "sta1" || k === "sta2" ? sta(v) : k === "trigger" || k === "permintaan" ? "#" + v : nilai(v)]);
    const peta = r.lat != null ? `<a class="db-peta" href="https://www.google.com/maps?q=${r.lat},${r.lon}" target="_blank" rel="noopener">Buka lokasi di Google Maps</a>` : "";
    return `<dl class="db-detail">${isi.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}
      <div><dt>Masuk database</dt><dd>${WIB(r.dibuat)} · nomor ${r.id}${r.tiket_no ? " · tiket #" + r.tiket_no : ""}</dd></div></dl>${peta}`;
  }

  function unduh() {
    const rows = tersaring(); if (!rows.length) return;
    const kunci = [...new Set(rows.flatMap((r) => Object.keys(r.data || {})))].filter((k) => !LEWATI.has(k) && !["pelapor", "tim", "waktu", "sta", "status"].includes(k));
    const kepala = ["Nomor", "Tanggal (WIB)", "Jenis", "Judul", "Pelapor", "Tim", "STA", "Status", "Lintang", "Bujur", ...kunci.map((k) => LABEL[k] || k)];
    const sel = (v) => { const s = v == null ? "" : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const isi = rows.map((r) => [r.id, new Date(r.waktu).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }), JENIS[r.jenis]?.n || r.jenis, judul(r), r.pelapor, r.tim,
      r.sta == null ? "" : String(r.sta).replace(".", ","), r.status, r.lat, r.lon, ...kunci.map((k) => r.data?.[k] == null ? "" : nilai(r.data[k]))].map(sel).join(";"));
    const blob = new Blob(["﻿" + [kepala.map(sel).join(";"), ...isi].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `Database_ALR_${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  el.addEventListener("click", (e) => {
    const tr = e.target.closest("[data-db-baris]");
    if (tr) { klik(); st.mode = "kartu"; st.buka = +tr.dataset.dbBaris; gambar(); setTimeout(() => el.querySelector(".db-baris.buka")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); return; }
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.dbMode) { klik(); st.mode = b.dataset.dbMode; try { localStorage.setItem("alr_db_mode", st.mode); } catch {} return gambar(); }
    if (b.dataset.dbUrut) { klik(); if (st.urut === b.dataset.dbUrut) st.turun = !st.turun; else { st.urut = b.dataset.dbUrut; st.turun = b.dataset.dbUrut === "waktu"; } return gambar(); }
    if (b.dataset.dbAksi === "tindak") { klik(); st.tindak = !st.tindak; return gambar(); }
    if (b.dataset.dbJenis) { klik(); st.jenis = b.dataset.dbJenis; gambar(); }
    else if (b.dataset.dbPer) { klik(); st.periode = b.dataset.dbPer; muat(); }
    else if (b.dataset.dbId) { klik(); st.buka = st.buka === +b.dataset.dbId ? null : +b.dataset.dbId; gambar(); }
    else if (b.dataset.dbAksi === "muat") { klik(); muat(); }
    else if (b.dataset.dbAksi === "csv") { klik(); unduh(); }
  });
  let sudah = false;
  window.addEventListener("alr:layar", (e) => { if (e.detail?.aktif === "database") { if (!sudah || Date.now() - sudah > 6e4) { sudah = Date.now(); muat(); } } });
  gambar();
})();
