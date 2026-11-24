"""Performa DT di jalan ALR per hari -> nilai kondisi jalan (untuk halaman grafik).

Sumber (semua opsional, dipakai yang ada):
  data/rit/*.csv   - per rit  : unit, berangkat, tiba, km           (export trip TrackSolid, arah muatan BSR -> 107)
                   - ringkasan: tanggal, n_trip, median_menit, p90_menit, median_km, n_lambat
  data/gps/*       - titik GPS (sama dengan peta): speed rata-rata DT jalan & % waktu berhenti di jalan
Output: docs/data/performa.json
"""
import glob, json, os
import numpy as np, pandas as pd
import hitung_trigger as ht

CFG, P = ht.CFG, ht.P
KL = CFG.get("kelayakan", {})
RIT_LAMBAT = KL.get("rit_lambat_menit", 195)


def skor(x, bagus, jelek):
    """100 kalau x sebagus 'bagus', 0 kalau sejelek 'jelek', linear di antaranya."""
    if x is None or pd.isna(x):
        return None
    return float(np.clip((x - jelek) / (bagus - jelek) * 100, 0, 100))


def angka(s):
    return pd.to_numeric(s.astype(str).str.replace(",", "."), errors="coerce")


def dari_log_trip(d):
    """Satu rit ALR = kosongan 107->BSR, antre+muat di BSR, muatan BSR->107, bongkar di 107."""
    d = d.rename(columns={"No Lambung": "unit", "Durasi (menit)": "menit"})
    iso = d.Tanggal.astype(str).str.match(r"^\d{4}-").any()
    d["tanggal"] = pd.to_datetime(d.Tanggal, dayfirst=not iso, errors="coerce").dt.normalize()
    d["menit"] = angka(d.menit); d["km"] = angka(d.KM)
    for c in ("Jam Keluar", "Jam Tiba"):
        d[c] = pd.to_datetime(d[c], errors="coerce", dayfirst=not d[c].astype(str).str.match(r"^\d{4}-").any())
    ada_jam = (d["Jam Keluar"].dt.hour + d["Jam Keluar"].dt.minute).fillna(0).gt(0).mean() > 0.2
    d = d.sort_values(["unit", "Jam Keluar", "tanggal"]).reset_index(drop=True)
    muat = d[(d.Dari == "BSR") & (d.Ke == "107")]
    kosong = d[(d.Dari == "107") & (d.Ke == "BSR")]
    g = muat.groupby("tanggal").agg(n_trip=("menit", "size"), median_menit=("menit", "median"),
                                    p90_menit=("menit", lambda s: s.quantile(0.9)), median_km=("km", "median"),
                                    n_lambat=("menit", lambda s: int((s > RIT_LAMBAT).sum()))).reset_index()
    g = g.merge(kosong.groupby("tanggal").menit.median().rename("kosong_menit").reset_index(), on="tanggal", how="left")
    if ada_jam:
        MAKS = KL.get("diam_maks_menit", 720)
        sebelum, sesudah = d.groupby("unit").shift(1), d.groupby("unit").shift(-1)
        # antre + muat di BSR: tiba di BSR (rit sebelumnya) -> keluar BSR bawa muatan
        m = (d.Dari == "BSR") & (d.Ke == "107") & (sebelum.Ke == "BSR")
        d.loc[m, "muat_bsr"] = (d.loc[m, "Jam Keluar"] - sebelum.loc[m, "Jam Tiba"]).dt.total_seconds() / 60
        # bongkar di 107: tiba di 107 bawa muatan -> keluar 107 (rit berikutnya)
        b = (d.Dari == "BSR") & (d.Ke == "107") & (sesudah.Dari == "107")
        d.loc[b, "bongkar_107"] = (sesudah.loc[b, "Jam Keluar"] - d.loc[b, "Jam Tiba"]).dt.total_seconds() / 60
        for c in ("muat_bsr", "bongkar_107"):
            d.loc[~d[c].between(0, MAKS), c] = np.nan     # buang yang tidak wajar (BD, menginap, data bolong)
        x = d[(d.Dari == "BSR") & (d.Ke == "107")].groupby("tanggal")[["muat_bsr", "bongkar_107"]].median()
        g = g.merge(x.rename(columns={"muat_bsr": "muat_bsr_menit", "bongkar_107": "bongkar_107_menit"}).reset_index(), on="tanggal", how="left")
    return g


def baca_rit():
    harian = []
    for f in sorted(glob.glob(P("data", "rit", "*.csv"))):
        d = pd.read_csv(f, encoding="utf-8-sig")
        if "Rute" in d.columns:                      # LOG TRIP HAULING (Google Sheet data ban)
            g = dari_log_trip(d)
        elif {"berangkat", "tiba"} <= set(d.columns):
            d["berangkat"] = pd.to_datetime(d.berangkat, errors="coerce"); d["tiba"] = pd.to_datetime(d.tiba, errors="coerce")
            d = d.dropna(subset=["berangkat", "tiba"])
            d["menit"] = (d.tiba - d.berangkat).dt.total_seconds() / 60
            d["tanggal"] = d.berangkat.dt.normalize()
            g = d.groupby("tanggal").agg(n_trip=("menit", "size"), median_menit=("menit", "median"),
                                         p90_menit=("menit", lambda s: s.quantile(0.9)), median_km=("km", "median"),
                                         n_lambat=("menit", lambda s: int((s > RIT_LAMBAT).sum()))).reset_index()
        elif "n_trip" in d.columns:
            d["tanggal"] = pd.to_datetime(d.tanggal, dayfirst=True, errors="coerce"); g = d
        else:
            print("  lewati", f); continue
        harian.append(g)
    if not harian:
        return pd.DataFrame(columns=["tanggal"])
    return pd.concat(harian).drop_duplicates("tanggal", keep="last")


def baca_gps_harian():
    try:
        jalur = ht.baca_jalur(); g = ht.proyeksi(ht.baca_gps(), jalur)
    except SystemExit:
        return pd.DataFrame(columns=["tanggal"])
    g = g[[ht.zona_bukan_jalan(s) is None for s in g.sta]]
    g = g[g.acc]                                   # hanya mesin hidup (parkir mesin mati tidak dihitung)
    g["tanggal"] = g.waktu.dt.normalize()
    out = g.groupby("tanggal").apply(lambda x: pd.Series(dict(
        gps_unit=x.unit.nunique(), gps_titik=len(x),
        gps_speed=round(float(x[x.speed > 0].speed.mean()), 1) if (x.speed > 0).any() else None,
        gps_pct_berhenti=round(float((x.speed == 0).mean() * 100), 1))), include_groups=False).reset_index()
    return out


def arah_gps(g):
    """Tebak arah tiap titik GPS dari gerak unit berikutnya: STA turun = muatan (BSR -> 107), STA naik = kosongan (107 -> BSR).
    Titik berhenti ikut arah gerak unit sesudahnya (ke mana dia akan jalan), kalau tidak ada pakai arah sebelumnya."""
    g = g.sort_values(["unit", "waktu"]).copy()
    u = g.groupby("unit")
    dn = u.sta.shift(-1) - g.sta
    jam = (u.waktu.shift(-1) - g.waktu).dt.total_seconds() / 3600
    gerak = pd.Series(np.where(jam <= 3, np.where(dn <= -0.3, "m", np.where(dn >= 0.3, "k", None)), None), index=g.index)
    g["arah"] = gerak.groupby(g.unit).bfill(limit=24).groupby(g.unit).ffill(limit=24)
    return g


def per_km():
    """Per KM (STA n s/d n+1) per hari: titik GPS, jam berhenti mesin hidup/mati, speed DT jalan, unit. Juga dipisah per arah."""
    try:
        jalur = ht.baca_jalur(); g = ht.proyeksi(ht.baca_gps(), jalur)
    except SystemExit:
        return
    nkm = int(jalur.sta.max())
    g = arah_gps(g)
    g["km"] = g.sta.astype(int).clip(upper=nkm - 1)
    g["tg"] = g.waktu.dt.strftime("%Y-%m-%d")

    def kumpul(x0):
        hari = {}
        for (tg, km), x in x0.groupby(["tg", "km"]):
            jalan = x[x.speed > 0]
            hari.setdefault(tg, {})[int(km)] = [int(len(x)), int(((x.speed == 0) & x.acc).sum()), int(((x.speed == 0) & ~x.acc).sum()),
                                                round(float(jalan.speed.sum()), 1), int(len(jalan)), sorted(x.unit.unique().tolist())]
        return hari
    km = [dict(km=k, label=f"KM {k}-{k + 1}", zona=ht.zona_bukan_jalan(k + 0.5)) for k in range(nkm)]
    hari = kumpul(g)
    arah = {"muatan": kumpul(g[g.arah == "m"]), "kosongan": kumpul(g[g.arah == "k"])}
    json.dump(dict(keterangan="hari[tanggal][km] = [titik GPS, jam berhenti mesin hidup, jam berhenti mesin mati, jumlah speed jalan, titik jalan, unit]; "
                              "arah.muatan = BSR->107, arah.kosongan = 107->BSR (ditebak dari gerak unit)",
                   km=km, hari=hari, arah=arah), open(P("docs", "data", "per_km.json"), "w"), separators=(",", ":"))
    print(f"Per KM: {len(hari)} hari x {nkm} KM; arah: muatan {int((g.arah == 'm').sum())}, kosongan {int((g.arah == 'k').sum())}, tidak tahu {int(g.arah.isna().sum())} titik")


def main():
    per_km()
    rit, gps = baca_rit(), baca_gps_harian()
    d = rit.merge(gps, on="tanggal", how="outer").sort_values("tanggal")
    t = KL
    baris = []
    min_titik = t.get("min_titik_gps_harian", 30)
    for _, r in d.iterrows():
        if not (r.get("gps_titik", 0) >= min_titik):          # data GPS hari itu terlalu sedikit -> jangan dinilai
            r = r.copy(); r["gps_speed"] = r["gps_pct_berhenti"] = np.nan
        n = r.get("n_trip")
        pct_lambat = (r.n_lambat / n * 100) if n and not pd.isna(n) and n > 0 else None
        s = {"durasi": skor(r.get("median_menit"), t.get("durasi_bagus_menit", 120), t.get("durasi_jelek_menit", 300)),
             "rit_lambat": skor(pct_lambat, 0, t.get("pct_lambat_jelek", 40)),
             "speed": skor(r.get("gps_speed"), t.get("speed_bagus_kmh", 20), t.get("speed_jelek_kmh", 8)),
             "berhenti": skor(r.get("gps_pct_berhenti"), 0, t.get("pct_berhenti_jelek", 40))}
        ada = [v for v in s.values() if v is not None]
        if not ada:
            continue
        idx = round(sum(ada) / len(ada)) if ada else None
        status = None if idx is None else "Kondisi baik" if idx >= t.get("batas_layak", 75) else "Perlu perhatian" if idx >= t.get("batas_perhatian", 50) else "Perlu perbaikan"
        f = lambda v, k=1: None if v is None or pd.isna(v) else round(float(v), k)
        baris.append(dict(tanggal=r.tanggal.strftime("%Y-%m-%d"), n_trip=None if n is None or pd.isna(n) else int(n),
                          median_menit=f(r.get("median_menit")), p90_menit=f(r.get("p90_menit")), median_km=f(r.get("median_km")),
                          n_lambat=None if pd.isna(r.get("n_lambat", np.nan)) else int(r.n_lambat), pct_lambat=f(pct_lambat),
                          gps_speed=f(r.get("gps_speed")), gps_pct_berhenti=f(r.get("gps_pct_berhenti")),
                          gps_unit=None if pd.isna(r.get("gps_unit", np.nan)) else int(r.gps_unit),
                          kosong_menit=f(r.get("kosong_menit")), muat_bsr_menit=f(r.get("muat_bsr_menit")),
                          bongkar_107_menit=f(r.get("bongkar_107_menit")),
                          skor={k: f(v, 0) for k, v in s.items()}, indeks=idx, status=status))
    out = dict(rit_lambat_menit=RIT_LAMBAT, kelayakan=KL, hari=baris)
    json.dump(out, open(P("docs", "data", "performa.json"), "w"), indent=1)
    print(f"Performa: {len(baris)} hari ({baris[0]['tanggal'] if baris else '-'} s/d {baris[-1]['tanggal'] if baris else '-'})")


if __name__ == "__main__":
    main()
