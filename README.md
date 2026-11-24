# Peta Jalan ALR (BSR - 107)

Web peta jalan hauling ALR. Segmen jalan berubah **merah** kalau beberapa unit WHL melambat atau tertahan di titik yang sama
(kemungkinan jalan jelek, licin, atau macet). Tiap trigger merah otomatis jadi **tiket** untuk pengawas ALR / RM,
yang datang ke lokasi lalu upload **foto dan video** di tiket itu sebagai lampiran laporan.

Peta: `https://<akun>.github.io/alr-peta/`

## Alur kerja

1. **Data GPS otomatis tiap 30 menit** dari TrackSolid Pro Open API (`scripts/tarik_tracksolid.py`). Isi 4 kunci di *Settings > Secrets and variables > Actions*: `TS_APP_KEY`, `TS_APP_SECRET`, `TS_USER`, `TS_PASS_MD5` (+ opsional `TS2_USER`, `TS2_PASS_MD5` akun 2, `TS_URL`, `TS_MAPPING_CSV`). Nilainya sama dengan Script Properties di Apps Script "Tracking GPS WHL". Data live disimpan di cache Actions, tidak di-commit. Cara manual tetap bisa: upload export TrackSolid (CSV/XLSX) ke folder `data/gps/`.
   Kolom yang dikenali: nama unit / device name, waktu / GPS time, lat / latitude, lon / longitude, speed, ACC (opsional).
2. **Otomatis (GitHub Action)**: `scripts/hitung_trigger.py` memotong jalan per 200 m, menghitung speed unit 24 jam terakhir,
   lalu mewarnai segmen: merah / kuning / hijau / abu (zona antre & parkir tidak dihitung).
3. **Tiket + notif**: `scripts/buat_tiket.py` membuat issue `[TRIGGER] Cek jalan STA ...` berlabel `trigger`,
   di-assign ke pengawas di `config.json` > `pengawas_github` (notif email & aplikasi GitHub di HP).
   Opsional notif Telegram: isi secret `TELEGRAM_TOKEN` dan `TELEGRAM_CHAT_ID`.
4. **Pengawas cek lapangan**: buka tiket, klik link koordinat untuk navigasi, lalu balas tiket dengan foto/video.
   Tiket yang sudah ada foto tampil di peta sebagai 📸. Tutup tiket kalau sudah ditangani.
5. **Lapor manual**: di peta, klik jalan atau tombol *Lokasi saya* lalu *Lapor + foto* (form laporan dengan STA dan koordinat terisi otomatis).

## Atur

`config.json`: batas merah/kuning, panjang segmen, zona antrean, titik rawan, akun GitHub pengawas.
`data/jalur_sta.csv`: garis tengah jalan + STA (BSR = STA 27, STA 0 dekat 107). Ganti dengan hasil survei/patok resmi kalau ada.

## Jalankan di laptop

```
pip install pandas numpy openpyxl
python scripts/hitung_trigger.py
python -m http.server -d docs 8000   # buka http://localhost:8000
```

## Tambah / hapus pengawas

Di web peta klik tombol 👷 > **+ Tambah pengawas** (atau *Hapus* di samping nama). Form terbuka di GitHub, isi username, nama, jabatan, lalu *Submit*.
GitHub Action otomatis memasukkan/menghapus pengawas di `config.json` dan membalas tiket. Hanya diproses kalau pembuatnya admin/collaborator repo.
Pengawas cukup punya akun GitHub gratis (github.com/signup). Notif dikirim lewat @mention di tiket trigger, jadi tidak wajib jadi collaborator.
