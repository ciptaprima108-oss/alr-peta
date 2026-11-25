/**
 * Kotak surat laporan ALR (Google Apps Script, di akun Google pemilik ALR).
 * Aplikasi ALR mengirim laporan (isi + foto) ke sini tanpa login. Laporan disimpan
 * sebagai file di folder Google Drive "ALR Laporan Masuk" milik pemilik.
 * GitHub Action ALR (ambil_laporan.py) mengambilnya tiap 5 menit lalu menjadikannya tiket
 * laporan di GitHub. Tidak ada token atau kunci rahasia di sini.
 *
 * Deploy: Terapkan > Deployment baru > Aplikasi web > Jalankan sebagai: Saya > Akses: Siapa saja.
 */
var NAMA_FOLDER = 'ALR Laporan Masuk';

function folder_() {
  var it = DriveApp.getFoldersByName(NAMA_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(NAMA_FOLDER);
}
function balas_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// HP kirim laporan
function doPost(e) {
  try {
    var c = CacheService.getScriptCache(), n = parseInt(c.get('n') || '0', 10);
    if (n >= 60) throw new Error('terlalu banyak laporan, coba lagi 10 menit lagi');
    c.put('n', String(n + 1), 600);
    var teks = e.postData.contents;
    if (teks.length > 12000000) throw new Error('laporan terlalu besar');
    var p = JSON.parse(teks);
    if (!p.rid || !/^[a-z0-9]{6,20}$/.test(p.rid)) throw new Error('laporan tidak sah');
    if (!p.baru && !(p.komentar || []).length) throw new Error('laporan kosong');
    var f = folder_();
    if (!f.getFilesByName(p.rid + '.json').hasNext()) f.createFile(p.rid + '.json', teks, 'application/json');
    return balas_({ ok: true, rid: p.rid });
  } catch (err) { return balas_({ ok: false, pesan: String(err.message || err) }); }
}

// GitHub Action ambil laporan: ?sejak=<waktu ms> -> paling banyak 10 laporan setelah waktu itu, urut dari yang lama.
// Tidak ada yang dihapus atau diubah lewat sini. Isi laporan memang akan tampil di tiket GitHub (repo publik).
function doGet(e) {
  var q = e.parameter || {};
  if (!q.sejak) return balas_({ ok: true, pesan: 'Kotak surat laporan ALR aktif' });
  var sejak = new Date(Math.max(0, parseInt(q.sejak, 10) || 0));
  var tz = Utilities.formatDate(sejak, 'UTC', "yyyy-MM-dd'T'HH:mm:ss");
  var it = folder_().searchFiles("modifiedDate > '" + tz + "' and mimeType = 'application/json'"), semua = [];
  while (it.hasNext()) { var x = it.next(), t = x.getDateCreated().getTime(); if (t > sejak.getTime()) semua.push({ t: t, f: x }); }
  semua.sort(function (a, b) { return a.t - b.t; });
  var out = semua.slice(0, 10).map(function (s) { return { t: s.t, p: JSON.parse(s.f.getBlob().getDataAsString()) }; });
  return balas_({ ok: true, laporan: out });
}
