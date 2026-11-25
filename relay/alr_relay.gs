/**
 * Kotak surat laporan ALR (Google Apps Script, di akun Google pemilik ALR).
 * Aplikasi ALR mengirim laporan (isi + foto) ke sini tanpa login. Laporan disimpan
 * sebagai file di folder Google Drive "ALR Laporan Masuk" milik pemilik.
 * GitHub Action ALR (ambil_laporan.py) mengambilnya tiap 5 menit pakai KUNCI_BACA,
 * lalu menjadikannya tiket laporan di GitHub. Tidak ada token GitHub di sini.
 *
 * Deploy: Terapkan > Deployment baru > Aplikasi web > Jalankan sebagai: Saya > Akses: Siapa saja.
 */
var KUNCI_BACA = '__KUNCI_BACA__';          // sama dengan secret ALR_KUNCI di GitHub
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

// GitHub Action ambil laporan: ?kunci=...           -> daftar laporan baru (paling banyak 10)
//                             ?kunci=...&selesai=rid -> tandai sudah diproses (file dipindah ke subfolder Selesai)
function doGet(e) {
  var q = e.parameter || {};
  if (q.kunci !== KUNCI_BACA) return balas_({ ok: true, pesan: 'Kotak surat laporan ALR aktif' });
  var f = folder_();
  if (q.selesai) {
    var sub = f.getFoldersByName('Selesai'); sub = sub.hasNext() ? sub.next() : f.createFolder('Selesai');
    var it = f.getFilesByName(q.selesai + '.json');
    while (it.hasNext()) it.next().moveTo(sub);
    return balas_({ ok: true });
  }
  var out = [], files = f.getFilesByType('application/json');
  while (files.hasNext() && out.length < 10) { var x = files.next(); out.push(JSON.parse(x.getBlob().getDataAsString())); }
  return balas_({ ok: true, laporan: out });
}
