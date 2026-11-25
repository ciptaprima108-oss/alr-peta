// laporwa.mjs - Lapor ALR lewat WhatsApp, MODE DIAM (bawaan).
// Selama "balas" di config tidak true, bot TIDAK PERNAH mengirim pesan ke grup atau ke pelapor.
// Kalau nanti "balas": true, bot membalas 1 pesan "✅ Diterima No. ..." (mengutip pesan #LAPOR) di grup itu saja. Bot hanya membaca pesan di grup ALR yang dipilih,
// lalu mengubah pesan berformat #LAPOR / #MINTA / #RM / #HUJAN (+ foto + share lokasi dari pengirim yang sama)
// menjadi laporan aplikasi ALR yang seragam (sama dengan form di aplikasi), dikirim ke relay ALR (Apps Script).
//
// Pasang di bot.mjs (lihat PASANG.txt):
//   import { buatLaporWa } from './laporwa.mjs';
//   const laporWa = buatLaporWa({ ambilSock: () => sock, log, cfg: () => cfg.laporAlr || {}, folder: sini });
//   di messages.upsert, setelah arsipGrup(m, jid):   laporWa(m, jid, namaGrup[jid]);
//
// config.json:  "laporAlr": { "aktif": true, "balas": false, "grup": ["HAULING GPE BSR-107 VIA ALR"], "relay": "https://script.google.com/macros/s/.../exec", "python": "" }
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { downloadMediaMessage } from 'baileys';

const PETA_URL = 'https://ciptaprima108-oss.github.io/alr-peta/data/segmen.geojson';
const TUNGGU_MS = 90 * 1000;          // laporan dikirim 90 detik setelah pesan terakhir dari pengirim itu (foto album, lokasi)
const SIMPAN_MS = 10 * 60 * 1000;     // foto/lokasi tanpa #LAPOR disimpan paling lama 10 menit, lalu dibuang
const MAKS_FOTO = 4;

const JENIS = {
  JALAN: { jenis: 'inspeksi', label: 'laporan-jalan', tag: 'INSPEKSI', nama: 'Inspeksi jalan' },
  MINTA: { jenis: 'logistik', label: 'logistik', tag: 'LOGISTIK', nama: 'Logistik' },
  RM: { jenis: 'rm', label: 'pekerjaan-rm', tag: 'PEKERJAAN RM', nama: 'Pekerjaan RM' },
  HUJAN: { jenis: 'lainnya', label: 'laporan-jalan', tag: 'LAINNYA', nama: 'Hujan / lainnya' },
  LAIN: { jenis: 'lainnya', label: 'laporan-jalan', tag: 'LAINNYA', nama: 'Hujan / lainnya' },
};
// "#LAPOR JALAN", "#LAPOR", "#MINTA", "#RM", "#HUJAN", "#LAPOR HUJAN", "#LAPOR LAIN"
export function bacaKunci(teks) {
  const m = String(teks || '').trim().match(/^#\s*(LAPOR(?:\s+(JALAN|HUJAN|LAIN(?:NYA)?|RM|MINTA))?|MINTA|RM|HUJAN)\b/i);
  if (!m) return null;
  const k = (m[2] || m[1]).toUpperCase().replace(/^LAPOR$/, 'JALAN').replace('LAINNYA', 'LAIN');
  return JENIS[k] || JENIS.JALAN;
}
// baris "Nama: isi" -> { nama: isi } (kunci huruf kecil, tanpa spasi)
export function bacaIsian(teks) {
  const o = {};
  for (const b of String(teks || '').split(/\r?\n/).slice(1)) {
    const m = b.match(/^\s*([A-Za-z .\/]+?)\s*[:=]\s*(.+)$/);
    if (m) o[m[1].toLowerCase().replace(/[^a-z]/g, '')] = m[2].trim();
  }
  return o;
}
const angka = (s) => { const m = String(s ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };
const fmtSta = (s) => { const km = Math.floor(s + 1e-9), m = Math.round((s - km) * 1000); return `${km}+${String(m).padStart(3, '0')}`; };
const WIB = (t) => new Date(t + 7 * 36e5).toISOString().replace('T', ' ').slice(0, 16) + ' WIB';
const nomorBaru = (t) => { const d = new Date(t + 7 * 36e5).toISOString(), a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return `L${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}-${Array.from({ length: 4 }, () => a[Math.floor(Math.random() * a.length)]).join('')}`; };
const tingkatDari = (s) => { s = String(s || '').toLowerCase(); return /berat|parah|segera|darurat/.test(s) ? 'Berat, perlu segera' : /ringan|kecil/.test(s) ? 'Ringan' : 'Sedang'; };
const bersih = (s) => String(s ?? '').replace(/[<>]/g, '').slice(0, 300);

// ---------- STA dari koordinat (garis tengah ALR di GitHub Pages) ----------
let SEG = null, segWaktu = 0;
async function muatSeg() {
  if (SEG && Date.now() - segWaktu < 6 * 36e5) return SEG;
  try { const r = await fetch(PETA_URL); if (r.ok) { SEG = (await r.json()).features || []; segWaktu = Date.now(); } } catch { /* pakai yang lama */ }
  return SEG || [];
}
export async function staDari(lat, lon) {
  const seg = await muatSeg(); let best = null;
  const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540;
  for (const f of seg) {
    const c = f.geometry?.coordinates || [];
    for (let i = 0; i + 1 < c.length; i++) {
      const [x1, y1] = [(c[i][0] - lon) * kx, (c[i][1] - lat) * ky], [x2, y2] = [(c[i + 1][0] - lon) * kx, (c[i + 1][1] - lat) * ky];
      const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / L));
      const j = Math.hypot(x1 + t * dx, y1 + t * dy);
      if (!best || j < best.j) best = { j, p: f.properties, t: (i + t) / Math.max(1, c.length - 1) };
    }
  }
  if (!best || best.j > 600) return null;
  return { sta: Math.round((best.p.sta_awal + (best.p.sta_akhir - best.p.sta_awal) * best.t) * 10) / 10, jarak: Math.round(best.j) };
}

// ---------- isi pesan ----------
function inti(m) { const x = m.message || {}; return x.ephemeralMessage?.message || x.viewOnceMessage?.message || x.viewOnceMessageV2?.message || x.documentWithCaptionMessage?.message || x; }
function teksDari(isi) { return isi.conversation || isi.extendedTextMessage?.text || isi.imageMessage?.caption || isi.videoMessage?.caption || ''; }
function lokasiDari(isi) { const l = isi.locationMessage || isi.liveLocationMessage; return l && l.degreesLatitude ? { lat: +l.degreesLatitude, lon: +l.degreesLongitude } : null; }

// cap foto: No. laporan, jam, lokasi, pelapor (pakai Python + Pillow kalau ada; kalau tidak, foto asli)
const CAP_PY = `import sys
from PIL import Image, ImageDraw, ImageFont
src, out, teks = sys.argv[1], sys.argv[2], sys.argv[3].split("|")
im = Image.open(src).convert("RGB")
s = min(1, 1600 / max(im.size)); im = im.resize((int(im.width * s), int(im.height * s)))
W, H = im.size; fs = max(18, W // 28); lh = int(fs * 1.32); pad = int(fs * .7); t = lh * len(teks) + pad * 2
def font(b):
    for n in (["arialbd.ttf", "DejaVuSans-Bold.ttf"] if b else ["arial.ttf", "DejaVuSans.ttf"]):
        try: return ImageFont.truetype(n, fs)
        except Exception: pass
    return ImageFont.load_default()
ov = Image.new("RGBA", (W, t), (7, 27, 58, 184)); im.paste(ov, (0, H - t), ov)
d = ImageDraw.Draw(im); d.rectangle([0, H - t, W // 2, H - t + max(3, fs // 6)], fill="#E11D2E"); d.rectangle([W // 2, H - t, W, H - t + max(3, fs // 6)], fill="#ffffff")
for i, x in enumerate(teks): d.text((pad, H - t + pad + i * lh), x, fill="#FFD54F" if i == 0 else "#ffffff", font=font(i == 0))
im.save(out, "JPEG", quality=80)
`;
function capFoto(python, buf, baris) {
  return new Promise((ok) => {
    if (!python) return ok(buf);
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'alrwa-')), a = path.join(d, 'a.jpg'), b = path.join(d, 'b.jpg'), py = path.join(d, 'cap.py');
    fs.writeFileSync(a, buf); fs.writeFileSync(py, CAP_PY);
    execFile(python, [py, a, b, baris.join('|')], { timeout: 30000 }, (err) => {
      let hasil = buf; try { if (!err) hasil = fs.readFileSync(b); } catch {}
      try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
      ok(hasil);
    });
  });
}

// ---------- susun laporan (sama dengan format aplikasi) ----------
export async function susunPaket(r) {
  const J = r.kunci, f = bacaIsian(r.teks), w = r.waktu;
  const no = nomorBaru(w), rid = (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).slice(0, 20);
  let sta = null, lokTeks = '-';
  if (r.lok) { const s = await staDari(r.lok.lat, r.lok.lon); sta = s?.sta ?? null; lokTeks = `${sta != null ? 'STA ' + fmtSta(sta) + ', ' : ''}koordinat ${r.lok.lat.toFixed(6)}, ${r.lok.lon.toFixed(6)} (share lokasi WA)`; }
  if (sta == null) { const k = angka(f.sta ?? f.km ?? f.lokasi); if (k != null && k >= 0 && k <= 40) { sta = k; lokTeks = `STA ${fmtSta(k)} (ditulis pelapor)`; } }
  const d = { v: 1, rid, no, jenis: J.jenis, pelapor: bersih(r.nama).slice(0, 80) || 'Pelapor WA', tim: bersih(f.tim || f.dari || r.grup).slice(0, 60), waktu: new Date(w).toISOString(),
    trigger: null, catatan: bersih(f.ket || f.keterangan || f.catatan), sumber: 'wa', grup: bersih(r.grup).slice(0, 80) };
  if (r.lok) Object.assign(d, { lat: +r.lok.lat.toFixed(6), lon: +r.lok.lon.toFixed(6) });
  d.sta = sta;
  let judul, baris = [];
  const masalah = bersih(f.masalah || f.kendala || f.kejadian || f.isi || '');
  if (J.jenis === 'inspeksi') {
    d.kendala = masalah ? [masalah] : ['(tidak ditulis)']; d.tingkat = tingkatDari(f.tingkat);
    judul = `[INSPEKSI] STA ${sta != null ? fmtSta(sta) : '?'}: ${d.kendala.join(', ')}`; baris = [['Kendala', d.kendala.join(', ')], ['Tingkat', d.tingkat]];
  } else if (J.jenis === 'lainnya') {
    d.kategori = [masalah || 'Hujan']; d.tingkat = tingkatDari(f.tingkat);
    judul = `[LAINNYA] STA ${sta != null ? fmtSta(sta) : '?'}: ${d.kategori.join(', ')}`; baris = [['Kejadian', d.kategori.join(', ')], ['Tingkat', d.tingkat]];
  } else if (J.jenis === 'logistik') {
    const jm = String(f.jumlah || f.jml || ''); d.status = 'Permintaan'; d.barang = bersih(f.barang || f.material || masalah || 'Material'); d.jumlah = angka(jm) || 0;
    d.satuan = (jm.match(/m3|m³|rit|ton|liter|ltr|batang|roll|karung|unit/i)?.[0] || 'unit').toLowerCase().replace('m3', 'm³').replace('ltr', 'liter'); d.kapan = bersih(f.kapan || 'Hari ini');
    judul = `[LOGISTIK] Permintaan ${String(d.jumlah).replace('.', ',')} ${d.satuan} ${d.barang}${sta != null ? ' ke STA ' + fmtSta(sta) : ''}`;
    baris = [['Status', d.status], ['Barang', `${d.jumlah} ${d.satuan} ${d.barang}`], ['Dibutuhkan', d.kapan]];
  } else {
    d.kegiatan = [bersih(f.kegiatan || f.kerja || masalah || 'Perbaikan jalan')]; d.alat = f.alat ? [bersih(f.alat)] : []; d.status = /lanjut|besok|belum/i.test(f.status || '') ? 'Lanjut besok' : 'Selesai';
    d.sta1 = sta; d.sta2 = null;
    judul = `[PEKERJAAN RM] STA ${sta != null ? fmtSta(sta) : '?'}: ${d.kegiatan.join(', ')}`; baris = [['Kegiatan', d.kegiatan.join(', ')], ['Alat', d.alat.join(', ')], ['Status', d.status]];
  }
  const kurang = [!r.foto.length && 'foto', !r.lok && 'share lokasi', sta == null && 'STA/KM'].filter(Boolean);
  if (kurang.length) d.kurang = kurang;
  const cap = [`ALR · ${no} · ${J.nama} (WA)`, WIB(w), r.lok ? `${sta != null ? 'STA ' + fmtSta(sta) + ' · ' : ''}${r.lok.lat.toFixed(5)}, ${r.lok.lon.toFixed(5)} (share lokasi)` : sta != null ? `STA ${fmtSta(sta)} (ditulis pelapor)` : 'Lokasi tidak dikirim', `${d.pelapor} · ${d.grup}`];
  const foto = [];
  for (const [i, b] of r.foto.entries()) foto.push({ b64: (await capFoto(r.python, b, cap)).toString('base64'), ket: J.jenis === 'rm' ? (i === 0 && r.foto.length > 1 ? 'SEBELUM' : 'SESUDAH') : `Foto ${i + 1}` });
  d.foto_ket = foto.map((x) => x.ket);
  const json = JSON.stringify(d).replace(/--/g, '\\u002d\\u002d');
  const isi = `<!-- alr ${json} -->\n### ${J.nama}\n\n` +
    [['No. laporan', no], ['Pelapor', `${d.pelapor}${d.tim ? ' (' + d.tim + ')' : ''}`], ['Waktu', WIB(w)], ['Lokasi', lokTeks], ...baris, ['Catatan', d.catatan],
      ['Belum lengkap', kurang.join(', ')], ['Sumber', `WhatsApp grup ${d.grup}`]]
      .filter(([, v]) => v).map(([k, v]) => `**${k}:** ${String(v).replace(/[<>]/g, '')}  `).join('\n') + '\n\n{{FOTO}}\n\n_Diserap otomatis dari WhatsApp (bot tidak membalas di grup)_';
  return { paket: { versi: 1, rid, foto, baru: { label: J.label, judul: judul.slice(0, 200), isi } }, no, judul };
}

// ---------- pengumpul pesan per pengirim ----------
export function buatLaporWa({ ambilSock, log = console.log, cfg = () => ({}), folder = '.' }) {
  const kotak = new Map();   // kunci grup|pengirim -> { kunci, teks, nama, grup, waktu, foto: [], lok, t0, timer }
  const rapat = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const CATAT = path.join(folder, 'arsip-lapor-alr');

  async function kirim(k, r) {
    kotak.delete(k);
    const c = cfg();
    try {
      const { paket, no, judul } = await susunPaket({ ...r, python: c.python || '' });
      fs.mkdirSync(CATAT, { recursive: true });
      const hari = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
      let hasil = 'belum-dikirim';
      if (c.relay) {
        const res = await fetch(c.relay, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(paket) });
        const j = await res.json().catch(() => ({})); hasil = j.ok ? 'terkirim' : 'ditolak: ' + (j.pesan || res.status);
      }
      if (hasil !== 'terkirim') fs.writeFileSync(path.join(CATAT, `antre-${paket.rid}.json`), JSON.stringify(paket));
      fs.appendFileSync(path.join(CATAT, hari + '.jsonl'), JSON.stringify({ waktu: WIB(Date.now()), no, judul, grup: r.grup, foto: r.foto.length, hasil }) + '\n');
      log(`📸 Lapor ALR ${no} (${r.grup}): ${judul} -> ${hasil}`);
      if (c.balas === true && r.jid && r.pesan) {     // hanya kalau dinyalakan pemilik
        const sta = (judul.match(/STA ([\d+?]+)/) || [])[1];
        const teks = `✅ *Diterima No. ${no}*\n${r.kunci.nama}${sta && sta !== '?' ? ' · STA ' + sta : ''}\n🕒 ${WIB(r.waktu)}\n📷 ${r.foto.length} foto · 👷 ${r.nama || 'Pelapor'}` +
          (r.foto.length && r.lok ? '' : `\n⚠️ Belum ada ${[!r.foto.length && 'foto', !r.lok && 'share lokasi'].filter(Boolean).join(' dan ')}`);
        try { await ambilSock()?.sendMessage(r.jid, { text: teks }, { quoted: r.pesan }); } catch (e) { log('✗ Balas lapor ALR: ' + e.message); }
      }
    } catch (e) { log('✗ Lapor ALR gagal: ' + e.message); }
  }
  // kirim ulang yang belum terkirim (tiap pesan masuk, paling sering 10 menit sekali)
  let ulangTerakhir = 0;
  async function kirimUlang() {
    const c = cfg(); if (!c.relay || Date.now() - ulangTerakhir < 6e5) return; ulangTerakhir = Date.now();
    let daftar = []; try { daftar = fs.readdirSync(CATAT).filter((f) => f.startsWith('antre-')); } catch { return; }
    for (const f of daftar.slice(0, 5)) {
      try { const p = fs.readFileSync(path.join(CATAT, f), 'utf8');
        const j = await (await fetch(c.relay, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: p })).json();
        if (j.ok) { fs.unlinkSync(path.join(CATAT, f)); log('📸 Lapor ALR terkirim ulang ' + f); } } catch { /* coba lagi nanti */ }
    }
  }
  function jadwal(k) {
    const r = kotak.get(k); if (!r) return;
    clearTimeout(r.timer);
    if (r.kunci) r.timer = setTimeout(() => kirim(k, r), TUNGGU_MS);
    else r.timer = setTimeout(() => kotak.delete(k), SIMPAN_MS);   // foto/lokasi tanpa #LAPOR: buang diam-diam
  }

  // dipanggil untuk SETIAP pesan masuk. Tidak pernah mengirim apa pun ke WhatsApp.
  return async function laporWa(m, jid, namaGrup) {
    try {
      const c = cfg();
      if (!c.aktif || !jid || !jid.endsWith('@g.us') || m.key?.fromMe) return false;
      const grup = namaGrup || jid;
      if (!(c.grup || []).some((g) => rapat(grup).includes(rapat(g)))) return false;
      kirimUlang();
      const isi = inti(m), teks = teksDari(isi), lok = lokasiDari(isi), adaFoto = !!isi.imageMessage, kunci = bacaKunci(teks);
      if (!kunci && !adaFoto && !lok) return false;
      const pengirim = m.key.participant || m.participant || jid, k = grup + '|' + pengirim;
      const waktu = Number(m.messageTimestamp) * 1000 || Date.now();
      let r = kotak.get(k);
      if (kunci && r?.kunci) { clearTimeout(r.timer); await kirim(k, r); r = null; }   // #LAPOR baru: yang lama langsung dikirim
      if (!r) { r = { kunci: null, teks: '', nama: m.pushName || '', grup, waktu, foto: [], lok: null }; kotak.set(k, r); }
      if (kunci) { r.kunci = kunci; r.teks = teks; r.waktu = waktu; r.nama = m.pushName || r.nama; r.jid = jid; r.pesan = m; }
      if (lok) r.lok = lok;
      if (adaFoto && r.foto.length < MAKS_FOTO) {
        const sock = ambilSock();
        const buf = await downloadMediaMessage(m, 'buffer', {}, { logger: undefined, reuploadRequest: sock?.updateMediaMessage });
        if (buf?.length) r.foto.push(buf);
      }
      jadwal(k);
      return !!kunci;
    } catch (e) { log('✗ Lapor ALR baca pesan: ' + e.message); return false; }
  };
}
