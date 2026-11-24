"""Perkiraan Rolling Resistance (RR) dan kebutuhan traksi per KM jalan ALR.

Tidak ada alat ukur RR di jalan, jadi ini PERKIRAAN dari perilaku DT:
  1. Tanjakan/turunan per KM dari peta ketinggian satelit (Copernicus DEM 90 m lewat open-meteo),
     disimpan sekali ke data/elevasi_jalur.csv. Bisa diganti hasil survei (kolom sta, elev).
  2. DT bermuatan yang jalan dengan tenaga penuh: daya = berat x g x kecepatan x (RR + tanjakan).
     Jadi total hambatan = daya efektif / (berat x g x kecepatan). Kecepatan = kecepatan DT muatan
     saat jalan lancar di KM itu (persentil 75 titik GPS >= 5 km/jam).
  3. RR = total hambatan - tanjakan (arah muatan).
  4. Kebutuhan traksi = (RR + tanjakan) / bagian berat di roda penggerak. Dibandingkan dengan
     daya cengkeram jalan tanah saat basah (~0,25) dan kering (~0,5).
Output: docs/data/rr_traksi.json
"""
import json, os, sys, time
import urllib.request
import numpy as np, pandas as pd
import hitung_trigger as ht
import hitung_performa as hp

CFG, P = ht.CFG, ht.P
A = {"daya_kw": 191, "efisiensi": 0.7, "berat_isi_ton": 40, "berat_kosong_ton": 15,
     "porsi_roda_penggerak_isi": 0.7, "porsi_roda_penggerak_kosong": 0.55,
     "mu_basah": 0.25, "mu_kering": 0.5, "rr_baik": 4, "rr_berat": 7, "min_titik": 15, **CFG.get("rr_traksi", {})}
F_ELEV = P("data", "elevasi_jalur.csv")


def ambil_elevasi(jalur):
    """Ketinggian tiap 100 m sepanjang jalur. Diambil sekali (butuh internet), lalu disimpan."""
    if os.path.exists(F_ELEV):
        return pd.read_csv(F_ELEV)
    sta = np.arange(0, jalur.sta.max() + 1e-9, 0.1)
    lat = np.interp(sta, jalur.sta, jalur.lat); lon = np.interp(sta, jalur.sta, jalur.lon)
    elev = []
    for i in range(0, len(sta), 100):
        url = ("https://api.open-meteo.com/v1/elevation?latitude=" + ",".join(f"{v:.5f}" for v in lat[i:i + 100]) +
               "&longitude=" + ",".join(f"{v:.5f}" for v in lon[i:i + 100]))
        for coba in range(3):
            try:
                elev += json.load(urllib.request.urlopen(url, timeout=30))["elevation"]; break
            except Exception as e:
                print("  elevasi gagal:", e); time.sleep(3)
        else:
            print("  elevasi tidak bisa diambil, tanjakan dianggap 0"); return None
    d = pd.DataFrame(dict(sta=sta.round(1), lat=lat.round(6), lon=lon.round(6), elev=elev))
    d.to_csv(F_ELEV, index=False); print(f"  elevasi disimpan: {len(d)} titik")
    return d


def main():
    jalur = ht.baca_jalur()
    nkm = int(jalur.sta.max())
    e = ambil_elevasi(jalur)
    if e is not None:
        e = e.sort_values("sta"); e["halus"] = e.elev.rolling(5, center=True, min_periods=1).mean()   # ratakan per 500 m
        el = lambda s: float(np.interp(s, e.sta, e.halus))
    g = hp.arah_gps(ht.proyeksi(ht.baca_gps(), jalur))
    g = g[[ht.zona_bukan_jalan(s) is None for s in g.sta]]
    g["km"] = g.sta.astype(int).clip(upper=nkm - 1)
    jalan = g[g.speed >= 5]
    g_isi = 9.81
    c_isi = A["daya_kw"] * 1000 * A["efisiensi"] / (A["berat_isi_ton"] * 1000 * g_isi)      # m/s, = (RR + tanjakan) x kecepatan
    hasil = []
    for k in range(nkm):
        zona = ht.zona_bukan_jalan(k + 0.5)
        tanjak = None if e is None else round((el(k) - el(k + 1)) / 10, 1)         # % naik untuk DT muatan (jalan dari STA k+1 ke k)
        r = dict(km=k, label=f"KM {k}-{k + 1}", zona=zona, tanjakan_muatan=tanjak,
                 elev=None if e is None else round(el(k), 1))
        m = jalan[(jalan.km == k) & (jalan.arah == "m")].speed
        kz = jalan[(jalan.km == k) & (jalan.arah == "k")].speed
        r["speed_muatan"] = round(float(m.quantile(.75)), 1) if len(m) >= A["min_titik"] else None
        r["speed_kosongan"] = round(float(kz.quantile(.75)), 1) if len(kz) >= A["min_titik"] else None
        r["titik"] = int(len(m))
        if r["speed_muatan"] and not zona:
            total = c_isi / (r["speed_muatan"] / 3.6) * 100
            rr = float(np.clip(total - (tanjak or 0), 1.5, 20))
            r["rr"] = round(rr, 1)
            r["rr_kelas"] = "baik" if rr <= A["rr_baik"] else "sedang" if rr <= A["rr_berat"] else "berat"
            # traksi: arah yang naik. Muatan naik kalau tanjak > 0, kosongan naik kalau tanjak < 0
            t = tanjak or 0
            mu = max((rr + max(t, 0)) / 100 / A["porsi_roda_penggerak_isi"], (rr + max(-t, 0)) / 100 / A["porsi_roda_penggerak_kosong"])
            r["mu_perlu"] = round(mu, 2)
            r["traksi"] = "rawan" if mu >= A["mu_basah"] else "waspada" if mu >= A["mu_basah"] * 0.6 else "aman"
        hasil.append(r)
    ok = [r for r in hasil if r.get("rr") is not None]
    asumsi = {k: A[k] for k in ("daya_kw", "efisiensi", "berat_isi_ton", "porsi_roda_penggerak_isi", "porsi_roda_penggerak_kosong", "mu_basah", "mu_kering", "rr_baik", "rr_berat")}
    out = dict(dibuat=pd.Timestamp.now(tz="Asia/Jakarta").strftime("%Y-%m-%d %H:%M"),
               periode=[g.waktu.min().strftime("%Y-%m-%d"), g.waktu.max().strftime("%Y-%m-%d")],
               ada_elevasi=e is not None, asumsi=asumsi, km=hasil,
               rr_rata=round(float(np.mean([r["rr"] for r in ok])), 1) if ok else None)
    json.dump(out, open(P("docs", "data", "rr_traksi.json"), "w"), separators=(",", ":"))
    print(f"RR & traksi: {len(ok)} KM dihitung, RR rata-rata {out['rr_rata']}%, elevasi {'ada' if e is not None else 'tidak ada'}")
    for r in hasil:
        print(f"  {r['label']:9} tanjak {r['tanjakan_muatan']}%  v {r['speed_muatan']}  RR {r.get('rr')}  mu {r.get('mu_perlu')} {r.get('traksi', '')} {r['zona'] or ''}")


if __name__ == "__main__":
    main()
