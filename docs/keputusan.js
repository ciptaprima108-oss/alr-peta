// Layar Keputusan untuk atasan (Owner, PJO, kepala divisi): tidak perlu mengetik apa-apa.
// Daftar trigger jalan merah dan laporan lapangan yang masih buka, masing-masing dengan 4 tombol besar:
// Setujui / Tugaskan RM / Logistik / Tutup. Keputusan dikirim sebagai komentar ke tiket (lewat jalur kirim lapor.js)
// dengan data <!-- alr {"jenis":"keputusan", ...} --> supaya muncul juga di Laporan lapangan dan Trigger.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const baca = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const tulis = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const klik = () => window.ALR_klik?.();
  const toast = (a, b) => window.ALR_toast?.(a, b);
  const fmtSta = (s) => window.ALR_fmtSta ? window.ALR_fmtSta(s) : String(s);
  const WIB = (d) => new Date(d).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(/\./g, ":") + " WIB";
  const AKSI = {
    setujui: { t: "Setujui", lengkap: "Disetujui", ik: "✔", w: "#1F8A4C" },
    rm: { t: "Tugaskan RM", lengkap: "Ditugaskan ke RM", ik: "🛠️", w: "#1556C7" },
    logistik: { t: "Logistik", lengkap: "Diteruskan ke Logistik", ik: "📦", w: "#E08A00" },
    tutup: { t: "Tutup", lengkap: "Ditutup", ik: "🔒", w: "#5A6A85" },
  };
  const NAMA_J = { inspeksi: "Jalan rusak", logistik: "Minta material", rm: "Pekerjaan RM", lainnya: "Hujan / lainnya" };
  const PROSES = "alr_kep_proses";           // keputusan yang baru dikirim dari HP ini (belum muncul di tiket)
  let TRIG = [], LAP = [], SARING = "perlu";

  const siapa = () => { const id = baca("alr_saya", ""); const p = (window.ALR_PENGGUNA || []).find((x) => x.id === id); return p ? { nama: p.nama, jab: p.jabatan || p.divisi || "" } : { nama: baca("alr_lapor_nama", "") || "Pimpinan", jab: "" }; };
  const kepTerakhir = (i) => {
    const dariTiket = window.ALR_kepTerakhir?.(i) || null, lokal = baca(PROSES, {})[i.number];
    if (lokal && (!dariTiket || new Date(lokal.waktu) > new Date(dariTiket.waktu))) return { ...lokal, proses: true };
    return dariTiket;
  };

  // butir yang perlu keputusan: trigger merah yang buka + laporan buka (jalan rusak, hujan/lainnya, permintaan material)
  function butir() {
    const out = [];
    for (const i of TRIG) if (i.state === "open") out.push({ i, jenis: "trigger", judul: i._lok?.label || i.title.replace(/^\[TRIGGER\]\s*/i, ""), sub: (i.body || "").match(/\*\*Alasan:\*\*\s*([^\n]+)/)?.[1]?.trim() || "Beberapa unit melambat / tertahan", tingkat: ["Trigger merah", "merah"], skor: 0, waktu: i.created_at });
    for (const i of LAP) {
      if (i.state !== "open") continue;
      const d = i._d || {}, j = d.jenis || (i.labels.some((l) => l.name === "logistik") ? "logistik" : i.labels.some((l) => l.name === "pekerjaan-rm") ? "rm" : "inspeksi");
      if (j === "rm") continue;                                         // pekerjaan RM = laporan hasil, bukan permintaan keputusan
      if (j === "logistik" && (d.status && d.status !== "Permintaan")) continue;
      const t = d.tingkat || "", berat = t.startsWith("Berat");
      const isi = j === "logistik" ? `${String(d.jumlah ?? "").replace(".", ",")} ${d.satuan || ""} ${d.barang || ""}${d.kapan ? ", " + d.kapan.toLowerCase() : ""}` : (d.kendala || d.kategori || []).join(", ");
      out.push({ i, d, jenis: j, judul: `${NAMA_J[j]}${d.sta != null ? " · STA " + fmtSta(d.sta) : ""}`, sub: isi || d.catatan || i.title.replace(/^\[[A-Z ]+\]\s*/, ""),
        tingkat: j === "logistik" ? ["Permintaan", "kuning"] : berat ? ["Berat", "merah"] : t === "Ringan" ? ["Ringan", "hijau"] : ["Sedang", "kuning"],
        skor: berat ? 1 : j === "logistik" ? 2 : 3, waktu: d.waktu || i.created_at });
    }
    out.forEach((b) => b.kep = kepTerakhir(b.i));
    return out.sort((a, b) => (!!a.kep - !!b.kep) || a.skor - b.skor || new Date(b.waktu) - new Date(a.waktu));
  }

  function kartu(b) {
    const i = b.i, d = b.d || {}, foto = i._gambar?.[0], k = b.kep, al = ALUR[i.number], ta = al && window.ALR_alur.TAHAP[al.s];
    const tombol = Object.entries(AKSI).map(([a, x]) => `<button type="button" class="kp-a" style="--w:${x.w}" data-kep="${a}" data-n="${i.number}"><i>${x.ik}</i>${x.t}</button>`).join("");
    return `<article class="kp-kartu${k ? " sudah" : ""}" data-n="${i.number}">
      <div class="kp-isi">${foto ? `<button type="button" class="kp-foto" data-lihat-foto="${esc(foto)}"><img src="${esc(foto)}" loading="lazy" alt="Foto laporan" onerror="this.parentNode.remove()"></button>` : `<span class="kp-foto kosong">${b.jenis === "trigger" ? "🚨" : "📷"}</span>`}
        <div><span class="kp-tingkat t-${b.tingkat[1]}">${esc(b.tingkat[0])}</span>
          <b>${esc(b.judul)}</b><p>${esc(b.sub)}</p>
          <small>${b.jenis === "trigger" ? `Trigger #${i.number}` : `${esc(d.pelapor || "")}${d.tim ? " (" + esc(d.tim) + ")" : ""}`} · ${WIB(b.waktu)}${d.no ? ` · ${esc(d.no)}` : ""}</small></div></div>
      ${ta ? `<p class="kp-alur t-${ta.w}">Tahap: <b>${esc(ta.t)}</b></p>` : ""}
      ${k ? `<p class="kp-sudah">${AKSI[k.aksi]?.ik || "✔"} <b>${esc(AKSI[k.aksi]?.lengkap || k.aksi)}</b> oleh ${esc(k.oleh)}, ${WIB(k.waktu)}${k.proses ? " · sedang diproses" : ""}</p>` : ""}
      <div class="kp-aksi">${tombol}</div></article>`;
  }

  let ALUR = {};
  function tampil() {
    const el = $("listKep"); if (!el) return;
    ALUR = {}; (window.ALR_alur?.temuan() || []).forEach((t) => { ALUR[t.nomor] = t; t.ikut.forEach((n) => ALUR[n] = t); });
    const semua = butir(), perlu = semua.filter((b) => !b.kep), sudah = semua.filter((b) => b.kep);
    const badge = $("ubinKep"); if (badge) { badge.hidden = !perlu.length; badge.textContent = perlu.length; }
    if ($("kepJml")) $("kepJml").innerHTML = `<button type="button" data-kep-saring="perlu" class="${SARING === "perlu" ? "aktif" : ""}">Perlu keputusan <b>${perlu.length}</b></button><button type="button" data-kep-saring="sudah" class="${SARING === "sudah" ? "aktif" : ""}">Sudah diputuskan <b>${sudah.length}</b></button>`;
    const daftar = SARING === "perlu" ? perlu : sudah;
    el.innerHTML = daftar.length ? daftar.map(kartu).join("") : `<div class="kp-kosong"><span>✅</span><h3>${SARING === "perlu" ? "Semua sudah diputuskan" : "Belum ada keputusan"}</h3><p>${SARING === "perlu" ? "Tidak ada trigger atau laporan yang menunggu." : "Keputusan yang dikirim akan muncul di sini."}</p></div>`;
  }

  async function putuskan(nomor, aksi, tombol) {
    const o = siapa(), waktu = new Date().toISOString(), x = AKSI[aksi];
    const data = { v: 1, jenis: "keputusan", aksi, oleh: o.nama, jabatan: o.jab, waktu, tahap: true };
    const isi = `<!-- alr ${JSON.stringify(data).replace(/--/g, "\\u002d\\u002d")} -->\n**${x.ik} ${x.lengkap}** oleh ${o.nama.replace(/[<>*]/g, "")}${o.jab ? " (" + o.jab.replace(/[<>*]/g, "") + ")" : ""}, ${WIB(waktu)}\n\n_Dari layar Keputusan aplikasi ALR_`;
    const rid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const paket = { versi: 1, rid, foto: [], komentar: [{ nomor, isi, tutup: aksi === "tutup" }] };
    const p = baca(PROSES, {}); p[nomor] = { aksi, oleh: o.nama, waktu }; tulis(PROSES, p);
    tombol.disabled = true;
    try { await window.ALR_kirimPaket(paket); toast(`ALR: ${x.lengkap}`, `#${nomor} terkirim. Tercatat di tiket dalam 5 sampai 15 menit.`); }
    catch (e) { window.ALR_antre?.(paket, `Keputusan #${nomor}: ${x.lengkap}`); toast("ALR: Disimpan di HP", "Keputusan dikirim otomatis begitu ada sinyal."); }
    tampil();
  }

  document.addEventListener("click", (e) => {
    const s = e.target.closest("[data-kep-saring]");
    if (s) { klik(); SARING = s.dataset.kepSaring; tampil(); return; }
    const b = e.target.closest("[data-kep]"); if (!b) return;
    klik();
    if (b.dataset.kep === "tutup" && !b.dataset.yakin) { b.dataset.yakin = "1"; b.innerHTML = "<i>🔒</i>Yakin tutup?"; setTimeout(() => { if (b.isConnected) { delete b.dataset.yakin; b.innerHTML = "<i>🔒</i>Tutup"; } }, 4000); return; }
    putuskan(+b.dataset.n, b.dataset.kep, b);
  });

  // belum ada data: jangan "Memuat..." selamanya
  let adaData = false;
  const pesanGagal = (teks) => { const el = $("listKep"); if (!el || adaData) return;
    el.innerHTML = `<div class="kp-kosong"><span>📶</span><h3>Data belum bisa dimuat</h3><p>${esc(teks)}</p><button type="button" class="kp-ulang" id="kepUlang">Coba lagi</button></div>`; };
  setTimeout(() => pesanGagal("Sinyal lambat atau server sibuk."), 12000);
  window.addEventListener("alr:tiket-gagal", (e) => pesanGagal(`Penyebab: ${e.detail?.pesan || "tidak diketahui"}.`));
  document.addEventListener("click", (e) => { if (!e.target.closest("#kepUlang")) return; klik(); $("listKep").innerHTML = '<p class="kecil">Memuat...</p>'; window.ALR_muatTiket?.(); setTimeout(() => pesanGagal("Masih belum bisa. Coba beberapa menit lagi."), 15000); });
  window.addEventListener("alr:tiket", (e) => {
    adaData = true;
    TRIG = e.detail.trig || []; LAP = e.detail.lap || [];
    // buang catatan lokal yang sudah tercatat di tiket (atau lebih dari 2 hari)
    const p = baca(PROSES, {});
    for (const [n, v] of Object.entries(p)) { const i = [...TRIG, ...LAP].find((x) => x.number === +n); const t = i && window.ALR_kepTerakhir?.(i);
      if ((t && new Date(t.waktu) >= new Date(v.waktu)) || Date.now() - new Date(v.waktu) > 2 * 864e5) delete p[n]; }
    tulis(PROSES, p);
    tampil();
  });
  window.addEventListener("alr:alur", () => adaData && tampil());
})();
