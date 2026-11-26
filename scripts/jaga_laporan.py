"""Jaga laporan: ambil laporan dari relay tiap ~1 menit selama ~55 menit, lalu selesai.

Jadwal GitHub ("*/5") kenyataannya hanya jalan sekitar sejam sekali, jadi laporan bisa telat sampai 1 jam.
Action yang dijalankan jadwal memanggil script ini supaya laporan, permintaan material, jawaban Logistik,
dan validasi inspeksi sampai ke HP dalam 1 sampai 3 menit. tiket.json ditulis ulang kalau ada laporan baru,
dan paling lambat tiap 10 menit (untuk perubahan dari luar aplikasi, misalnya trigger baru).
"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ambil_laporan, tulis_tiket

LAMA = int(os.environ.get("JAGA_MENIT", "55")) * 60
JEDA = 60
mulai = time.time()
terakhir_tulis = 0
while True:
    try:
        baru = ambil_laporan.main() or 0
    except Exception as e:
        print("ambil gagal:", e); baru = 0
    if baru or time.time() - terakhir_tulis > 600:
        try:
            tulis_tiket.main(); terakhir_tulis = time.time()
        except Exception as e:
            print("tulis tiket gagal:", e)
    if time.time() - mulai + JEDA > LAMA:
        break
    sys.stdout.flush()
    time.sleep(JEDA)
