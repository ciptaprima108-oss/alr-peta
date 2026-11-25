"""Analisa GPS PER MENIT unit WHL di jalan ALR (sejak 25 Nov 2026).

Sumber : data/gps/rapat/YYYY-MM-DD.csv.gz  (unit, waktu WIB, lat, lon, speed, acc, area)
         diisi tarik_tracksolid.py dari tab GPS ALR RAPAT (Apps Script "Tracking GPS WHL" -> GpsRapatAlr.gs).
Hasil  : docs/data/gps_rapat.json, per tanggal (7 hari terakhir):
  - ringkas   : unit, jam data, kecepatan rata-rata DT jalan
  - per_km    : per KM & arah (muatan BSR->107 / kosongan 107->BSR): kecepatan rata-rata & pelan (10% terpelan),
                menit berhenti mesin hidup / mati, jumlah unit
  - berhenti  : titik berhenti di JALAN >= 5 menit (unit, jam mulai-selesai, STA, mesin hidup/mati)
  - kunjungan : masuk/keluar geofence WHL BSR & 107 per unit, menit di dalam & menit diam (antre + muat/bongkar)
  - perjalanan: keluar 107 -> masuk BSR (kosongan) dan keluar BSR -> masuk 107 (muatan), lama tempuh per unit
  - antrean_bsr: per 15 menit [jam, DT di dalam geofence BSR, DT yang diam di sana]
  Catatan: geofence "BSR" WHL ada di sekitar STA 26.2-26.7 (bukan STA 29).

Bisa juga dipakai dari skrip lain (mis. laporan harian):
    import hitung_gps_rapat as gr
    hasil = gr.ringkas_periode("2026-11-25 06:00", "2026-11-25 17:00")
"""
import glob, json, os, sys
from datetime import datetime, timedelta

import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hitung_trigger as ht

P = ht.P
CFG = ht.CFG
DIAM_KMH = 3            # di bawah ini dianggap berhenti
MIN_BERHENTI = 5        # menit, titik berhenti yang dilaporkan
CELAH_MAKS = 60         # menit: GPS diam (mesin mati) di tempat yang sama tetap dihitung berhenti
AREA_DICATAT = ("BSR", "107")


def baca(mulai=None, akhir=None):
    fs = sorted(glob.glob(P("data", "gps", "rapat", "*.csv.gz")))
    if mulai is not None:
        fs = [f for f in fs if os.path.basename(f)[:10] >= (pd.Timestamp(mulai) - pd.Timedelta(days=1)).strftime("%Y-%m-%d")]
    if akhir is not None:
        fs = [f for f in fs if os.path.basename(f)[:10] <= pd.Timestamp(akhir).strftime("%Y-%m-%d")]
    if not fs:
        return pd.DataFrame(columns=["unit", "waktu", "lat", "lon", "speed", "acc", "area"])
    g = pd.concat([pd.read_csv(f, dtype={"unit": str, "area": str}) for f in fs], ignore_index=True)
    g["waktu"] = pd.to_datetime(g.waktu)
    g["acc"] = g.acc.astype(str).str.upper().eq("ON")
    g["area"] = g.area.fillna("").astype(str).str.replace(r"\.0$", "", regex=True).str.upper()
    g = g.drop_duplicates(["unit", "waktu"]).sort_values(["unit", "waktu"]).reset_index(drop=True)
    if mulai is not None:
        g = g[g.waktu >= pd.Timestamp(mulai)]
    if akhir is not None:
        g = g[g.waktu < pd.Timestamp(akhir)]
    return g.reset_index(drop=True)


def pasang_sta(g, jalur):
    """STA terdekat + jarak ke garis jalan (tanpa membuang titik jauh, area BSR bisa > 150 m dari as jalan)."""
    if g.empty:
        return g.assign(sta=[], jarak_m=[])
    c = np.cos(np.radians(jalur.lat.mean())); K = ht.K
    jx, jy = jalur.lon.values * K * c, jalur.lat.values * K
    gx, gy = g.lon.values * K * c, g.lat.values * K
    idx = np.empty(len(g), int); d = np.empty(len(g))
    for s in range(0, len(g), 2000):
        dd = np.hypot(gx[s:s + 2000, None] - jx[None], gy[s:s + 2000, None] - jy[None])
        idx[s:s + 2000] = dd.argmin(1); d[s:s + 2000] = dd.min(1)
    return g.assign(sta=jalur.sta.values[idx], jarak_m=d)


def tandai_arah(g):
    """m = muatan (STA turun, BSR->107), k = kosongan (STA naik). Dari posisi unit ~10 menit kemudian/sebelumnya."""
    g = g.sort_values(["unit", "waktu"]).copy()
    kiri = g[["unit", "waktu", "sta"]].reset_index()
    kanan = g[["unit", "waktu", "sta"]].rename(columns={"waktu": "t2", "sta": "sta2"})
    maju = pd.merge_asof(kiri.assign(t2=kiri.waktu + pd.Timedelta(minutes=10)).sort_values("t2"), kanan.sort_values("t2"),
                         on="t2", by="unit", direction="forward", tolerance=pd.Timedelta(minutes=20)).set_index("index")
    dn = (maju.sta2 - maju.sta).reindex(g.index)
    gerak = pd.Series(np.where(dn <= -0.3, "m", np.where(dn >= 0.3, "k", None)), index=g.index)
    g["arah"] = gerak.groupby(g.unit).bfill(limit=240).groupby(g.unit).ffill(limit=240)
    return g


def zona(sta):
    return ht.zona_bukan_jalan(sta)


def episode_berhenti(g):
    """Runtun menit berhenti per unit. GPS bisa diam saat mesin mati: celah <= CELAH_MAKS menit di tempat yang sama ikut dihitung."""
    out = []
    for u, x in g.groupby("unit", sort=False):
        x = x.sort_values("waktu")
        t, sp, la, lo = x.waktu.values, x.speed.values, x.lat.values, x.lon.values
        diam = sp < DIAM_KMH
        i, n = 0, len(x)
        while i < n:
            if not diam[i]:
                i += 1; continue
            j = i
            while j + 1 < n and diam[j + 1]:
                celah = (t[j + 1] - t[j]) / np.timedelta64(1, "m")
                jauh = np.hypot((la[j + 1] - la[j]) * 110574, (lo[j + 1] - lo[j]) * 111320 * np.cos(np.radians(la[j]))) > 150
                if celah > CELAH_MAKS or jauh:
                    break
                j += 1
            menit = (t[j] - t[i]) / np.timedelta64(1, "m") + 1
            if menit >= MIN_BERHENTI:
                s = x.iloc[i:j + 1]
                out.append(dict(unit=u, mulai=pd.Timestamp(t[i]), selesai=pd.Timestamp(t[j]) + pd.Timedelta(minutes=1), menit=int(round(menit)),
                                sta=round(float(s.sta.median()), 2), jarak_m=float(s.jarak_m.median()),
                                hidup=float(s.acc.mean()), area=s.area.mode().iat[0] if len(s.area.mode()) else "",
                                arah=s.arah.dropna().mode().iat[0] if "arah" in s and s.arah.notna().any() else None))
            i = j + 1
    return pd.DataFrame(out)


def kunjungan_area(g, area):
    """Masuk/keluar geofence (BSR / 107) per unit. Keluar sebentar < 20 menit dianggap masih di dalam."""
    out = []
    for u, x in g.groupby("unit", sort=False):
        x = x.sort_values("waktu")
        di = x[x.area == area]
        if di.empty:
            continue
        t = di.waktu.values
        pisah = np.r_[True, np.diff(t) / np.timedelta64(1, "m") > 20]
        for grp in np.split(np.arange(len(t)), np.where(pisah)[0][1:]):
            masuk, keluar = pd.Timestamp(t[grp[0]]), pd.Timestamp(t[grp[-1]]) + pd.Timedelta(minutes=1)
            d = dict(unit=u, area=area, masuk=masuk, keluar=keluar, menit_di_dalam=int(round((keluar - masuk).total_seconds() / 60)))
            # data terpotong di awal/akhir periode -> tandai supaya tidak salah baca
            d["masuk_terpotong"] = bool(masuk <= x.waktu.min())
            d["keluar_terpotong"] = bool(keluar - pd.Timedelta(minutes=1) >= x.waktu.max())
            dalam = x[(x.waktu >= masuk) & (x.waktu < keluar) & (x.area == area)]
            d["menit_diam"] = max(0, d["menit_di_dalam"] - int((dalam.speed >= DIAM_KMH).sum()))   # antre + muat/bongkar (GPS sering diam saat mesin mati, jadi = total - menit bergerak)
            out.append(d)
    return pd.DataFrame(out)


def antrean_bsr(g, langkah="15min"):
    """Per 15 menit: [jam, DT di dalam geofence BSR, DT yang sedang diam di BSR]. Geofence BSR WHL ada di STA +-26.2-26.7."""
    z = g[g.area == "BSR"]
    if z.empty:
        return []
    z = z.assign(slot=z.waktu.dt.floor(langkah))
    semua = z.groupby("slot").unit.nunique()
    diam = z[z.speed < DIAM_KMH].groupby("slot").unit.nunique()
    return [[t.strftime("%H:%M"), int(v), int(diam.get(t, 0))] for t, v in semua.items()]


def perjalanan(kunj):
    """Dari urutan kunjungan area per unit: keluar 107 -> masuk BSR = kosongan, keluar BSR -> masuk 107 = muatan."""
    out = []
    if kunj.empty:
        return out
    for u, k in kunj.sort_values("masuk").groupby("unit"):
        k = k.reset_index(drop=True)
        for i in range(1, len(k)):
            a, b = k.iloc[i - 1], k.iloc[i]
            if a.area == b.area or a.keluar_terpotong or b.masuk_terpotong:
                continue
            menit = (b.masuk - a.keluar).total_seconds() / 60
            if 0 < menit <= 240:
                out.append(dict(unit=u, jenis="muatan" if a.area == "BSR" else "kosongan", dari=a.area, ke=b.area,
                                berangkat=fmt(a.keluar), tiba=fmt(b.masuk), menit=int(round(menit))))
    return out


def per_km(g, jalur):
    nkm = int(jalur.sta.max())
    r = g[g.jarak_m <= CFG["jarak_maks_ke_jalan_m"]].copy()
    r["km"] = r.sta.astype(int).clip(upper=nkm - 1)
    out = {}
    for nama, kode in (("muatan", "m"), ("kosongan", "k")):
        x0 = r[r.arah == kode]
        d = {}
        for km, x in x0.groupby("km"):
            jalan = x[x.speed >= DIAM_KMH]
            d[int(km)] = dict(
                speed=round(float(jalan.speed.mean()), 1) if len(jalan) >= 3 else None,
                speed_pelan=round(float(jalan.speed.quantile(0.1)), 1) if len(jalan) >= 10 else None,
                menit_jalan=int(len(jalan)), menit_diam_hidup=int(((x.speed < DIAM_KMH) & x.acc).sum()),
                menit_diam_mati=int(((x.speed < DIAM_KMH) & ~x.acc).sum()), unit=int(x.unit.nunique()),
                zona=zona(km + 0.5))
        out[nama] = d
    return out


def fmt(t):
    return pd.Timestamp(t).strftime("%Y-%m-%d %H:%M") if t is not None and pd.notna(t) else None


def ringkas_periode(mulai, akhir, g=None, jalur=None):
    """Semua angka untuk satu periode (mis. 1 hari, atau 06.00-17.00 buat laporan sore). Waktu WIB."""
    jalur = jalur if jalur is not None else ht.baca_jalur()
    if g is None:
        g = baca(pd.Timestamp(mulai) - pd.Timedelta(hours=4), akhir)      # 4 jam sebelum: buat hitung antre/arah
    if g.empty:
        return dict(mulai=str(mulai), akhir=str(akhir), ada_data=False)
    g = tandai_arah(pasang_sta(g, jalur))
    mulai, akhir = pd.Timestamp(mulai), pd.Timestamp(akhir)
    w = g[(g.waktu >= mulai) & (g.waktu < akhir)]
    if w.empty:
        return dict(mulai=fmt(mulai), akhir=fmt(akhir), ada_data=False)
    jalan_ok = w[(w.jarak_m <= CFG["jarak_maks_ke_jalan_m"]) & (w.speed >= DIAM_KMH) & w.area.eq("")]
    jalan_ok = jalan_ok[[zona(s) is None for s in jalan_ok.sta]]
    ep = episode_berhenti(w)
    stop = []
    if len(ep):
        ep = ep[(ep.area == "") & (ep.jarak_m <= CFG["jarak_maks_ke_jalan_m"])]
        for _, e in ep.sort_values("menit", ascending=False).iterrows():
            z = zona(e.sta)
            stop.append(dict(unit=e.unit, mulai=fmt(e.mulai), selesai=fmt(e.selesai), menit=int(e.menit), sta=float(e.sta),
                             km=int(e.sta), mesin="hidup" if e.hidup >= 0.5 else "mati", arah=e.arah if isinstance(e.arah, str) else None, zona=z))
    kunj, semua_k = [], []
    for a in AREA_DICATAT:
        k = kunjungan_area(g, a)
        if len(k):
            semua_k.append(k)
            k = k[(k.keluar > mulai) & (k.masuk < akhir)]
            for _, r in k.sort_values("masuk").iterrows():
                kunj.append({kk: (fmt(v) if isinstance(v, pd.Timestamp) else v) for kk, v in r.items()})
    trip = perjalanan(pd.concat(semua_k)) if semua_k else []
    trip = [t for t in trip if mulai.strftime("%Y-%m-%d %H:%M") <= t["berangkat"] < akhir.strftime("%Y-%m-%d %H:%M")]
    bsr = [k for k in kunj if k["area"] == "BSR" and not k["masuk_terpotong"] and not k["keluar_terpotong"]]
    jalan_stop = [s for s in stop if not s["zona"]]
    med = lambda v: int(round(float(np.median(v)))) if v else None
    return dict(
        mulai=fmt(mulai), akhir=fmt(akhir), ada_data=True,
        ringkas=dict(unit=int(w.unit.nunique()), data_dari=fmt(w.waktu.min()), data_sampai=fmt(w.waktu.max()),
                     speed_jalan=round(float(jalan_ok.speed.mean()), 1) if len(jalan_ok) else None,
                     berhenti_di_jalan=len(jalan_stop), menit_berhenti_di_jalan=int(sum(s["menit"] for s in jalan_stop)),
                     masuk_bsr=len([k for k in kunj if k["area"] == "BSR" and not k["masuk_terpotong"]]),
                     menit_di_bsr_tengah=med([k["menit_di_dalam"] for k in bsr]), menit_di_bsr_maks=max([k["menit_di_dalam"] for k in bsr], default=None),
                     menit_kosongan_tengah=med([t["menit"] for t in trip if t["jenis"] == "kosongan"]),
                     menit_muatan_tengah=med([t["menit"] for t in trip if t["jenis"] == "muatan"]),
                     dt_di_bsr_maks=max([x[1] for x in antrean_bsr(w)], default=None)),
        perjalanan=trip,
        per_km=per_km(w, jalur), berhenti=stop, kunjungan=kunj, antrean_bsr=antrean_bsr(w))


def main():
    jalur = ht.baca_jalur()
    g = baca()
    if g.empty:
        print("GPS per menit: belum ada data di data/gps/rapat/"); return
    hari = sorted(g.waktu.dt.strftime("%Y-%m-%d").unique())[-7:]
    out = dict(keterangan="GPS per menit (TrackSolid track.list) unit WHL di ALR. Waktu WIB. arah m = muatan BSR->107, k = kosongan 107->BSR. "
                          "berhenti = >= 5 menit kecepatan < 3 km/jam; zona = area antre/parkir (bukan masalah jalan). "
                          "kunjungan = masuk/keluar geofence WHL (BSR, 107), menit_diam = antre + muat/bongkar; perjalanan = keluar satu area sampai masuk area lain; "
                          "antrean_bsr = [jam, DT di dalam BSR, DT diam di BSR] per 15 menit.",
               dibuat=datetime.now().strftime("%Y-%m-%d %H:%M"), hari={})
    for tg in hari:
        a = pd.Timestamp(tg)
        r = ringkas_periode(a, a + pd.Timedelta(days=1), g=g[(g.waktu >= a - pd.Timedelta(hours=4)) & (g.waktu < a + pd.Timedelta(days=1))], jalur=jalur)
        out["hari"][tg] = r
        s = r.get("ringkas", {})
        print(f"{tg}: {s.get('unit')} unit, speed jalan {s.get('speed_jalan')} km/j, berhenti di jalan {s.get('berhenti_di_jalan')}x "
              f"({s.get('menit_berhenti_di_jalan')} mnt), masuk BSR {s.get('masuk_bsr')}x, di BSR {s.get('menit_di_bsr_tengah')} mnt, "
              f"kosongan {s.get('menit_kosongan_tengah')} mnt, muatan {s.get('menit_muatan_tengah')} mnt")
    json.dump(out, open(P("docs", "data", "gps_rapat.json"), "w"), separators=(",", ":"), default=str)


if __name__ == "__main__":
    main()
