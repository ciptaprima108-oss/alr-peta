# Peta Jalan ALR (BSR - 107)

Web peta jalan hauling ALR. Segmen jalan berubah **merah** kalau beberapa unit WHL melambat atau tertahan di titik yang sama
(kemungkinan jalan jelek, licin, atau macet). Tiap trigger merah otomatis jadi **tiket** untuk pengawas ALR / RM,
yang datang ke lokasi lalu upload **foto dan video** di tiket itu sebagai lampiran laporan.

Peta: `https://<akun>.github.io/alr-peta/`

## Alur kerja

1. **Upload data GPS**: export TrackSolid (CSV/XLSX) diupload ke folder `data/gps/` (GitHub: *Add file > Upload files*).
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
