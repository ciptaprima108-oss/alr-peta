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
    # per jam (untuk grafik 1 hari = 24 batang)
    g["jam"] = g.waktu.dt.hour
    jam = {}
    for (tg, j), x in g.groupby(["tanggal", "jam"]):
        jalan = x[x.speed > 0]
        jam.setdefault(tg.strftime("%Y-%m-%d"), []).append([int(j),
            round(float(jalan.speed.mean()), 1) if len(jalan) else None,
            round(float((x.speed == 0).mean() * 100), 1), int(len(x)), int(x.unit.nunique())])
    out.attrs["jam"] = jam
    return out


def baca_hujan():
    """Hujan per hari (mm) di jalan ALR dari open-meteo (perkiraan satelit+model), 3 titik: 107, tengah, BSR.
    Satu "hari hujan" = 18.00 malam sebelumnya s/d 18.00 hari itu, supaya hujan semalam ikut. Disimpan di data/hujan_harian.csv."""
    f = P("data", "hujan_harian.csv")
    lama = pd.read_csv(f) if os.path.exists(f) else pd.DataFrame(columns=["tanggal", "hujan_mm", "hujan_malam_mm"])
    try:
        import urllib.request
        titik = [(-3.62411, 103.72945), (-3.680, 103.660), (-3.73706, 103.6244)]
        url = ("https://api.open-meteo.com/v1/forecast?latitude=" + ",".join(f"{a}" for a, _ in titik) + "&longitude=" + ",".join(f"{b}" for _, b in titik) +
               "&hourly=precipitation&past_days=92&forecast_days=1&timezone=Asia%2FJakarta")
        js = json.load(urllib.request.urlopen(url, timeout=30))
        js = js if isinstance(js, list) else [js]
        hs = []
        for t in js:
            h = pd.DataFrame(dict(waktu=pd.to_datetime(t["hourly"]["time"]), mm=t["hourly"]["precipitation"])).dropna()
            h["tanggal"] = (h.waktu + pd.Timedelta(hours=6)).dt.normalize()      # 18.00 kemarin s/d 18.00 = satu hari
            h["malam"] = (h.waktu.dt.hour >= 18) | (h.waktu.dt.hour < 6)
            hs.append(h.groupby("tanggal").apply(lambda x: pd.Series(dict(hujan_mm=x.mm.sum(), hujan_malam_mm=x[x.malam].mm.sum())), include_groups=False))
        baru = pd.concat(hs).groupby(level=0).max().reset_index()           # ambil titik yang paling basah
        baru = baru[baru.tanggal <= pd.Timestamp.now(tz="Asia/Jakarta").tz_localize(None).normalize()]
        baru["tanggal"] = baru.tanggal.dt.strftime("%Y-%m-%d")
        lama = pd.concat([lama[~lama.tanggal.isin(baru.tanggal)], baru]).sort_values("tanggal")
        lama[["hujan_mm", "hujan_malam_mm"]] = lama[["hujan_mm", "hujan_malam_mm"]].astype(float).round(1)
        lama.to_csv(f, index=False)
        print(f"Hujan: {len(baru)} hari dari open-meteo")
    except Exception as e:
        print("Hujan: tidak bisa ambil open-meteo (" + str(e)[:80] + "), pakai simpanan", len(lama), "hari")
    return {r.tanggal: (float(r.hujan_mm), float(r.hujan_malam_mm)) for r in lama.itertuples()}


def km_lambat_harian():
    """Per hari: berapa % KM jalan (bukan zona antre/parkir) yang kecepatan DT jalannya <= 13 km/jam."""
    try:
        d = json.load(open(P("docs", "data", "per_km.json")))
    except Exception:
        return {}
    zona = {k["km"] for k in d["km"] if k.get("zona")}
    out = {}
    for tg, h in d["hari"].items():
        sp = [v[3] / v[4] for k, v in h.items() if int(k) not in zona and v[4] >= 2]
        if len(sp) >= 5:
            lambat = sum(1 for x in sp if x <= KL.get("km_lambat_kmh", 13))
            out[tg] = (lambat / len(sp) * 100, lambat, len(sp))
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
    g["zp"] = [ht.zona_bukan_jalan(x) for x in g.sta]                     # zona antre/parkir per titik
    km_zona = {k for k in range(nkm) if ht.zona_bukan_jalan(k + 0.5)}
    # KM biasa: buang titik yang jatuh di zona parkir kecil (mis. parkir dekat 107), simpan jamnya untuk info
    lepas = g[g.zp.notna() & ~g.km.isin(km_zona)]
    zona_hari = {}
    for (tg, z), x in lepas[lepas.speed == 0].groupby(["tg", "zp"]):
        zona_hari.setdefault(tg, {})[z] = int(len(x))
    g = g.drop(lepas.index)

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
                   km=km, hari=hari, arah=arah, zona_hari=zona_hari), open(P("docs", "data", "per_km.json"), "w"), separators=(",", ":"))
    # per 200 m (dibuka saat KM diketuk). Titik GPS per jam, jadi ini petunjuk lokasi, bukan hitungan menit yang tepat
    g2 = pd.concat([g, lepas])
    nseg = int(round(jalur.sta.max() / 0.2))
    g2["seg"] = (g2.sta / 0.2).astype(int).clip(upper=nseg - 1)
    def kumpul2(x0):
        out = {}
        for (tg, sg), x in x0.groupby(["tg", "seg"]):
            jalan = x[x.speed > 0]
            out.setdefault(tg, {})[int(sg)] = [int(len(x)), int(((x.speed == 0) & x.acc).sum()), int(((x.speed == 0) & ~x.acc).sum()),
                                               round(float(jalan.speed.sum()), 1), int(len(jalan))]
        return out
    seg = [dict(i=i, sta_awal=round(i * 0.2, 1), zona=ht.zona_bukan_jalan(i * 0.2 + 0.1)) for i in range(nseg)]
    json.dump(dict(keterangan="per 200 m: hari[tanggal][seg] = [titik GPS, jam berhenti mesin hidup, jam berhenti mesin mati, jumlah speed jalan, titik jalan]",
                   panjang_m=200, seg=seg, hari=kumpul2(g2), arah={"muatan": kumpul2(g2[g2.arah == "m"]), "kosongan": kumpul2(g2[g2.arah == "k"])}),
              open(P("docs", "data", "per_200m.json"), "w"), separators=(",", ":"))
    print(f"Per KM: {len(hari)} hari x {nkm} KM; arah: muatan {int((g.arah == 'm').sum())}, kosongan {int((g.arah == 'k').sum())}, tidak tahu {int(g.arah.isna().sum())} titik")


def main():
    per_km()
    rit, gps = baca_rit(), baca_gps_harian()
    hujan, kml = baca_hujan(), km_lambat_harian()
    try:
        n_trig = len(json.load(open(P("docs", "data", "ringkasan.json"))).get("trigger", []))
    except Exception:
        n_trig = None
    d = rit.merge(gps, on="tanggal", how="outer").sort_values("tanggal")
    t = KL
    baris = []
    min_titik = t.get("min_titik_gps_harian", 30)
    for _, r in d.iterrows():
        if not (r.get("gps_titik", 0) >= min_titik):          # data GPS hari itu terlalu sedikit -> jangan dinilai
            r = r.copy(); r["gps_speed"] = r["gps_pct_berhenti"] = np.nan
        rit_aneh = not pd.isna(r.get("median_menit", np.nan)) and r.median_menit > KL.get("durasi_tidak_wajar_menit", 720)
        if rit_aneh:                                              # rit belasan jam = data trip salah baca, jangan dinilai
            r = r.copy(); r["median_menit"] = r["n_lambat"] = np.nan
        n = r.get("n_trip")
        pct_lambat = (r.n_lambat / n * 100) if n and not pd.isna(n) and n > 0 else None
        s = {"durasi": skor(r.get("median_menit"), t.get("durasi_bagus_menit", 120), t.get("durasi_jelek_menit", 300)),
             "rit_lambat": skor(pct_lambat, 0, t.get("pct_lambat_jelek", 40)),
             "speed": skor(r.get("gps_speed"), t.get("speed_bagus_kmh", 20), t.get("speed_jelek_kmh", 8)),
             "berhenti": skor(r.get("gps_pct_berhenti"), 0, t.get("pct_berhenti_jelek", 40))}
        tg = r.tanggal.strftime("%Y-%m-%d")
        # cek silang data lain: KM yang lambat, hujan semalam, trigger merah yang masih terbuka (hari terakhir)
        kl = kml.get(tg)
        s["km_lambat"] = skor(kl[0], 0, KL.get("pct_km_lambat_jelek", 30)) if kl else None
        hj = hujan.get(tg)
        s["hujan"] = skor(hj[0], 0, KL.get("hujan_jelek_mm", 25)) if hj else None
        terakhir = tg == d.tanggal.max().strftime("%Y-%m-%d")
        s["trigger"] = skor(n_trig, 0, KL.get("trigger_jelek", 12)) if terakhir and n_trig is not None else None
        ada = [v for v in s.values() if v is not None]
        if not ada:
            continue
        idx = round(sum(ada) / len(ada))
        # catatan: apa yang menurunkan nilai & seberapa yakin
        alasan = []
        if hj and hj[0] >= 2: alasan.append(f"Hujan {hj[0]:.0f} mm" + (f", {hj[1]:.0f} mm semalam" if hj[1] >= 1 else ""))
        if kl and kl[1]: alasan.append(f"{kl[1]} KM DT jalan pelan (13 km/jam ke bawah)")
        if s["trigger"] is not None and n_trig: alasan.append(f"{n_trig} titik jalan merah masih terbuka")
        if s["durasi"] is not None and s["durasi"] < 60: alasan.append(f"1 rit rata-rata {int(r.median_menit // 60)} jam {int(r.median_menit % 60)} mnt")
        if s["berhenti"] is not None and s["berhenti"] < 60: alasan.append(f"DT berhenti {r.gps_pct_berhenti:.0f}% waktu")
        kurang = []
        if rit_aneh: kurang.append("data rit hari ini tidak wajar")
        elif s["durasi"] is None: kurang.append("data rit belum masuk")
        if s["speed"] is None: kurang.append("data GPS kurang")
        if s["hujan"] is None: kurang.append("data hujan belum ada")
        yakin = "tinggi" if len(ada) >= 5 and s["durasi"] is not None and s["speed"] is not None else "sedang" if len(ada) >= 4 else "rendah"
        status = None if idx is None else "Kondisi baik" if idx >= t.get("batas_layak", 75) else "Perlu perhatian" if idx >= t.get("batas_perhatian", 50) else "Perlu perbaikan"
        f = lambda v, k=1: None if v is None or pd.isna(v) else round(float(v), k)
        baris.append(dict(tanggal=r.tanggal.strftime("%Y-%m-%d"), n_trip=None if n is None or pd.isna(n) else int(n),
                          median_menit=f(r.get("median_menit")), p90_menit=f(r.get("p90_menit")), median_km=f(r.get("median_km")),
                          n_lambat=None if pd.isna(r.get("n_lambat", np.nan)) else int(r.n_lambat), pct_lambat=f(pct_lambat),
                          gps_speed=f(r.get("gps_speed")), gps_pct_berhenti=f(r.get("gps_pct_berhenti")),
                          gps_unit=None if pd.isna(r.get("gps_unit", np.nan)) else int(r.gps_unit),
                          kosong_menit=f(r.get("kosong_menit")), muat_bsr_menit=f(r.get("muat_bsr_menit")),
                          bongkar_107_menit=f(r.get("bongkar_107_menit")),
                          skor={k: f(v, 0) for k, v in s.items()}, indeks=idx, status=status,
                          hujan_mm=hj[0] if hj else None, hujan_malam_mm=hj[1] if hj else None,
                          km_lambat=kl[1] if kl else None, yakin=yakin, alasan=alasan, kurang=kurang))
    # nilai per jam: dari kecepatan DT jalan & % berhenti (rit dihitung per hari, jadi tidak ikut)
    jam = {}
    for tg, a in gps.attrs.get("jam", {}).items():
        jam[tg] = []
        for j, sp, br, n, u in a:
            if n < t.get("min_titik_gps_jam", 3):
                continue
            ss = [v for v in (skor(sp, t.get("speed_bagus_kmh", 20), t.get("speed_jelek_kmh", 8)), skor(br, 0, t.get("pct_berhenti_jelek", 40))) if v is not None]
            jam[tg].append([j, round(sum(ss) / len(ss)) if ss else None, sp, br, n, u])
    out = dict(rit_lambat_menit=RIT_LAMBAT, kelayakan=KL, hari=baris, jam=jam,
               keterangan_jam="jam[tanggal] = [jam, nilai 0-100, kecepatan DT jalan, % berhenti, titik GPS, unit]")
    json.dump(out, open(P("docs", "data", "performa.json"), "w"), indent=1)
    print(f"Performa: {len(baris)} hari ({baris[0]['tanggal'] if baris else '-'} s/d {baris[-1]['tanggal'] if baris else '-'})")


if __name__ == "__main__":
    main()
