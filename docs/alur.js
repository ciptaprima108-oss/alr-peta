// Alur temuan jalan ALR (26 Nov 2026, dari pengguna):
//   Tim inspeksi lapor  ->  masuk ke RM  ->  RM cek & kerja (butuh material: minta ke Logistik)
//   ->  Logistik jawab "Dikirim"  ->  balik ke RM  ->  RM lapor "Selesai"  ->  balik ke tim inspeksi  ->  inspeksi validasi.
//   Valid = temuan ditutup. Belum beres = kembali ke RM.
// Trigger GPS (jalan merah) lebih dulu dicek tim inspeksi; setelah dicek ikut alur yang sama.
// Tahap tiap temuan dibaca dari data <!-- alr {...} --> di komentar tiket (tahap:true), jadi semua HP melihat hal yang sama.
(function () {
  const baca = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const tulis = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const fmtSta = (s) => window.ALR_fmtSta ? window.ALR_fmtSta(s) : String(s);
  const WIB = (d) => new Date(d).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(/\./g, ":") + " WIB";
  const PROSES = "alr_alur_proses";        // tombol yang baru dipencet di HP ini (belum tercatat di tiket)
  let TRIG = [], LAP = [];

  const data = (i) => (window.ALR_bacaData ? window.ALR_bacaData(i._teks || i.body || "") : []);
  const d0 = (i) => i._d || data(i)[0] || null;
  const jenis = (i) => d0(i)?.jenis || (i.labels.some((l) => l.name === "logistik") ? "logistik" : i.labels.some((l) => l.name === "pekerjaan-rm") ? "rm" : "inspeksi");

  const TAHAP = {
    cek: { t: "Trigger GPS, perlu dicek", w: "merah", siapa: "inspeksi" },
    rm: { t: "Baru, menunggu RM", w: "merah", siapa: "rm" },
    ulang: { t: "Dikembalikan: belum beres", w: "merah", siapa: "rm" },
    kerja: { t: "Sedang dikerjakan RM", w: "biru", siapa: "rm" },
    minta: { t: "Menunggu material dari Logistik", w: "kuning", siapa: "logistik" },
    dikirim: { t: "Material dikirim Logistik", w: "biru", siapa: "rm" },
    diterima: { t: "Material sudah sampai", w: "biru", siapa: "rm" },
    validasi: { t: "Selesai dikerjakan, tunggu validasi", w: "hijau", siapa: "inspeksi" },
    valid: { t: "Sudah divalidasi", w: "hijau", siapa: "" },
  };

  function tahapDari(ev, awal) {
    let s = awal, x = null;
    for (const e of ev) {
      if (e.jenis === "inspeksi" && s === "cek") s = "rm";
      else if (e.jenis === "logistik") s = e.status === "Permintaan" ? "minta" : e.status === "Dikirim" ? "dikirim" : "diterima";
      else if (e.jenis === "rm") s = e.status === "Selesai" ? "validasi" : "kerja";
      else if (e.jenis === "validasi") s = e.hasil === "valid" ? "valid" : "ulang";
      else continue;
      x = e;
    }
    return { s, x };
  }

  // semua temuan yang masih buka, masing-masing dengan tahapnya
  function temuan() {
    const buka = (i) => i.state === "open", out = [], lokal = baca(PROSES, {});
    const trigBuka = new Set(TRIG.filter(buka).map((i) => i.number));
    const buat = (i, anak, awal, trig) => {
      const ev = data(i).filter((e) => e.tahap || e.jenis === "validasi");
      anak.forEach((a) => ev.push(...data(a).filter((e) => e.jenis === "validasi")));
      ev.sort((a, b) => new Date(a.waktu || 0) - new Date(b.waktu || 0));
      let { s, x } = tahapDari(ev, awal);
      const l = lokal[i.number];
      if (l && (!x || new Date(l.waktu) > new Date(x.waktu || 0))) { s = l.s; x = { ...l, proses: true }; }
      const d = trig ? (anak[0] && d0(anak[0])) || {} : d0(i) || {};
      const sta = d.sta ?? i._lok?.sta ?? null;
      const minta = LAP.filter((p) => buka(p) && jenis(p) === "logistik" && d0(p)?.trigger === i.number);
      return { i, nomor: i.number, ikut: anak.map((a) => a.number), trig, s, x, d, sta, minta,
        judul: `${trig ? "Trigger GPS" : "Jalan rusak"}${sta != null ? " · STA " + fmtSta(sta) : ""}`,
        isi: (d.kendala || []).join(", ") || (trig ? (i.body || "").match(/\*\*Alasan:\*\*\s*([^\n]+)/)?.[1]?.trim() : "") || i.title.replace(/^\[[A-Z ]+\]\s*/, ""),
        pelapor: d.pelapor ? `${d.pelapor}${d.tim ? " (" + d.tim + ")" : ""}` : "", tingkat: d.tingkat || "",
        foto: i._gambar?.length ? i._gambar[i._gambar.length - 1] : anak.find((a) => a._gambar?.length)?._gambar[0] || null,
        waktu: d.waktu || i.created_at };
    };
    for (const t of TRIG.filter(buka)) {
      const anak = LAP.filter((x) => buka(x) && jenis(x) === "inspeksi" && d0(x)?.trigger === t.number);
      const dicek = anak.length || data(t).some((e) => e.jenis === "inspeksi");
      out.push(buat(t, anak, dicek ? "rm" : "cek", true));
    }
    for (const i of LAP.filter((x) => buka(x) && jenis(x) === "inspeksi" && !trigBuka.has(d0(x)?.trigger))) out.push(buat(i, [], "rm", false));
    return out.filter((t) => t.s !== "valid");
  }

  // permintaan material yang belum dijawab Logistik
  function permintaan() {
    return LAP.filter((i) => i.state === "open" && jenis(i) === "logistik").map((i) => {
      const all = data(i), d = all[0] || {}, up = all.slice(1).filter((x) => !x.tahap).pop();
      const l = baca(PROSES, {})["p" + i.number];
      return { i, nomor: i.number, d, status: l && (!up || new Date(l.waktu) > new Date(up.waktu)) ? l.s : up?.status || d.status, up };
    }).filter((p) => p.status === "Permintaan");
  }

  const tandai = (kunci, s) => { const p = baca(PROSES, {}); p[kunci] = { s, waktu: new Date().toISOString() }; tulis(PROSES, p); window.dispatchEvent(new CustomEvent("alr:alur")); };

  // tim inspeksi: Valid (tutup temuan) / Belum beres (kembali ke RM)
  async function validasi(nomor, hasil, catatan, siapa) {
    const t = temuan().find((x) => x.nomor === nomor); if (!t) throw new Error("temuan tidak ada");
    const waktu = new Date().toISOString(), valid = hasil === "valid";
    const d = { v: 1, jenis: "validasi", hasil, oleh: siapa.nama, tim: siapa.tim, waktu, catatan: catatan || "", tahap: true };
    const bersih = (s) => String(s || "").replace(/[<>*]/g, "");
    const isi = `<!-- alr ${JSON.stringify(d).replace(/--/g, "\\u002d\\u002d")} -->\n**${valid ? "✅ Divalidasi: temuan sudah beres" : "↩️ Belum beres, dikembalikan ke RM"}** oleh ${bersih(siapa.nama)}${siapa.tim ? " (" + bersih(siapa.tim) + ")" : ""}, ${WIB(waktu)}${catatan ? `\n\n**Catatan:** ${bersih(catatan)}` : ""}\n\n_Dari aplikasi ALR_`;
    const rid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const paket = { versi: 1, rid, foto: [], komentar: [t.nomor, ...t.ikut].slice(0, 3).map((n) => ({ nomor: n, isi, tutup: valid })) };
    tandai(nomor, valid ? "valid" : "ulang");
    try { await window.ALR_kirimPaket(paket); return true; }
    catch { window.ALR_antre?.(paket, `Validasi #${nomor}: ${valid ? "sudah beres" : "belum beres"}`); return false; }
  }

  window.ALR_alur = { temuan, permintaan, validasi, tandai, TAHAP };
  window.addEventListener("alr:tiket", (e) => {
    TRIG = e.detail.trig || []; LAP = e.detail.lap || [];
    // buang catatan lokal yang sudah tercatat di tiket (atau lebih dari 2 hari)
    const p = baca(PROSES, {}), semua = [...TRIG, ...LAP];
    for (const [k, v] of Object.entries(p)) {
      const i = semua.find((x) => "" + x.number === k.replace(/^p/, ""));
      const akhir = i && data(i).slice(-1)[0];
      if (!i || i.state === "closed" || (akhir && new Date(akhir.waktu || 0) >= new Date(v.waktu)) || Date.now() - new Date(v.waktu) > 2 * 864e5) delete p[k];
    }
    tulis(PROSES, p);
    window.dispatchEvent(new CustomEvent("alr:alur"));
  });
})();
