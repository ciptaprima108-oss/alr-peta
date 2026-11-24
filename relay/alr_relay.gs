/**
 * Relay laporan ALR (Google Apps Script).
 * Menerima laporan dari aplikasi ALR lalu menyimpannya ke GitHub (foto + tiket),
 * supaya pelapor di lapangan tidak perlu akun GitHub. Token GitHub disimpan di sini
 * (Script Properties), tidak pernah ada di aplikasi.
 *
 * Pasang:
 *  1. script.google.com > Proyek baru > tempel file ini.
 *  2. Setelan proyek (ikon gir) > Script Properties > tambah GITHUB_TOKEN = token fine-grained
 *     khusus repo alr-peta dengan izin Contents: Read and write, Issues: Read and write.
 *  3. Terapkan > Deployment baru > Jenis: Aplikasi web > Jalankan sebagai: Saya > Akses: Siapa saja > Terapkan.
 *  4. Salin URL /exec, kirim ke admin ALR untuk ditaruh di docs/lapor.json ("relay").
 */
var REPO = 'ciptaprima108-oss/alr-peta';
var CABANG_FOTO = 'laporan-foto';
var LABEL_BOLEH = ['laporan-jalan', 'logistik', 'pekerjaan-rm'];
var LABEL_KOMENTAR = ['trigger', 'laporan-jalan', 'logistik', 'pekerjaan-rm'];
var LABEL_TUTUP = ['trigger', 'logistik'];

function doGet() { return balas({ ok: true, pesan: 'Relay laporan ALR aktif' }); }

function doPost(e) {
  try {
    batasi();
    var p = JSON.parse(e.postData.contents);
    var foto = (p.foto || []).slice(0, 6), komentar = (p.komentar || []).slice(0, 3);
    if (!p.baru && !komentar.length) throw new Error('laporan kosong');
    if (p.baru) {
      if (LABEL_BOLEH.indexOf(p.baru.label) < 0) throw new Error('jenis laporan tidak dikenal');
      if (!/^\[(INSPEKSI|LOGISTIK|PEKERJAAN RM)\]/.test(p.baru.judul || '')) throw new Error('judul tidak sah');
      if (String(p.baru.isi || '').length > 20000) throw new Error('isi terlalu panjang');
    }
    foto.forEach(function (f) { if (!f.b64 || f.b64.length > 4000000) throw new Error('foto terlalu besar'); });

    var bln = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM'), url = [];
    foto.forEach(function (f) {
      var path = 'foto/' + bln + '/' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7) + '.jpg';
      gh('/repos/' + REPO + '/contents/' + path, 'put', { message: 'Foto laporan ALR', content: f.b64, branch: CABANG_FOTO });
      url.push('![' + String(f.ket || 'Foto').replace(/[\[\]]/g, '') + '](https://raw.githubusercontent.com/' + REPO + '/' + CABANG_FOTO + '/' + path + ')');
    });
    var fotoMd = url.join('\n'), nomor = null;
    if (p.baru) {
      nomor = gh('/repos/' + REPO + '/issues', 'post', { title: String(p.baru.judul).slice(0, 200), body: String(p.baru.isi).replace('{{FOTO}}', fotoMd), labels: [p.baru.label] }).number;
    }
    komentar.forEach(function (k) {
      var no = parseInt(k.nomor, 10);
      var is = gh('/repos/' + REPO + '/issues/' + no, 'get');
      var lbl = (is.labels || []).map(function (l) { return l.name; });
      if (!lbl.some(function (l) { return LABEL_KOMENTAR.indexOf(l) >= 0; })) throw new Error('tiket #' + no + ' bukan tiket ALR');
      var isi = String(k.isi || '').slice(0, 20000).replace('{{FOTO}}', fotoMd).replace(/\{\{NOMOR\}\}/g, String(nomor || no));
      gh('/repos/' + REPO + '/issues/' + no + '/comments', 'post', { body: isi });
      if (k.tutup && lbl.some(function (l) { return LABEL_TUTUP.indexOf(l) >= 0; }))
        gh('/repos/' + REPO + '/issues/' + no, 'patch', { state: 'closed', state_reason: 'completed' });
      if (!nomor) nomor = no;
    });
    return balas({ ok: true, nomor: nomor });
  } catch (err) {
    return balas({ ok: false, pesan: String(err.message || err) });
  }
}

function gh(path, method, body) {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  var o = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' } };
  if (body) { o.contentType = 'application/json'; o.payload = JSON.stringify(body); }
  var r = UrlFetchApp.fetch('https://api.github.com' + path, o);
  if (r.getResponseCode() >= 300) throw new Error('GitHub ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 150));
  return JSON.parse(r.getContentText() || 'null');
}

// paling banyak 30 laporan per 10 menit, supaya tidak bisa dibanjiri
function batasi() {
  var c = CacheService.getScriptCache(), n = parseInt(c.get('n') || '0', 10);
  if (n >= 30) throw new Error('terlalu banyak laporan, coba lagi 10 menit lagi');
  c.put('n', String(n + 1), 600);
}

function balas(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
