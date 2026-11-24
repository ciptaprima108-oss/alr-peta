"""Hitung status jalan ALR per segmen dari data GPS TrackSolid, lalu tulis file untuk peta.

Input :
  data/jalur_sta.csv        garis tengah jalan (lat, lon, sta)
  data/gps/*.csv / *.xlsx   export TrackSolid (kolom unit, waktu, lat, lon, speed, [acc])
  config.json               batas merah/kuning, zona antrean, titik penting
Output:
  docs/data/segmen.geojson  segmen jalan + warna status
  docs/data/titik.geojson   titik penting + label STA
  docs/data/ringkasan.json  waktu data, daftar trigger merah
  trigger_baru.json         daftar segmen merah (dipakai GitHub Action bikin tiket)

Pakai: python scripts/hitung_trigger.py
"""
import glob, json, math, os, re, sys
import numpy as np, pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)
CFG = json.load(open(P("config.json"), encoding="utf-8"))
K = 111320.0


# ---------- garis jalan ----------
def baca_jalur():
    j = pd.read_csv(P("data", "jalur_sta.csv")).sort_values("sta").reset_index(drop=True)
    # haluskan sedikit (Chaikin 2x) supaya tikungan tidak patah-patah
    pts = j[["lat", "lon", "sta"]].values
    for _ in range(2):
        q = [pts[0]]
        for a, b in zip(pts[:-1], pts[1:]):
            q += [0.75 * a + 0.25 * b, 0.25 * a + 0.75 * b]
        q.append(pts[-1]); pts = np.array(q)
    # rapatkan tiap ~10 m sepanjang STA
    s = np.arange(pts[0, 2], pts[-1, 2] + 1e-9, 0.01)
    lat = np.interp(s, pts[:, 2], pts[:, 0]); lon = np.interp(s, pts[:, 2], pts[:, 1])
    return pd.DataFrame(dict(lat=lat, lon=lon, sta=s))


def titik_di_sta(jalur, sta):
    return float(np.interp(sta, jalur.sta, jalur.lat)), float(np.interp(sta, jalur.sta, jalur.lon))


# ---------- baca GPS (nama kolom TrackSolid bisa beda-beda) ----------
POLA = {
    "unit": r"^(unit|device ?name|nama ?unit|nama|target ?name|plat|no ?unit|imei)$",
    "waktu": r"^(waktu|time|gps ?time|tanggal|datetime|positioning ?time|date ?time|tgl ?jam)$",
    "lat": r"^(lat|latitude|lintang)$",
    "lon": r"^(lon|lng|long|longitude|bujur)$",
    "speed": r"^(speed|speed_kmh|speed ?\(km/h\)|kecepatan|kec)$",
    "acc": r"^(acc|acc ?status|status ?acc|mesin)$",
}


def rapikan_kolom(df):
    pilih = {}
    for c in df.columns:
        n = str(c).strip().lower()
        for k, pola in POLA.items():
            if k not in pilih and re.match(pola, n):
                pilih[k] = c
    if "lat" not in pilih and any(str(c).strip().lower() in ("lat/lng", "latlng", "koordinat", "lokasi") for c in df.columns):
        c = [c for c in df.columns if str(c).strip().lower() in ("lat/lng", "latlng", "koordinat", "lokasi")][0]
        ll = df[c].astype(str).str.extract(r"(-?\d+\.\d+)\s*[,; ]\s*(-?\d+\.\d+)")
        df["__lat"], df["__lon"] = ll[0].astype(float), ll[1].astype(float); pilih["lat"], pilih["lon"] = "__lat", "__lon"
    kurang = [k for k in ("unit", "waktu", "lat", "lon", "speed") if k not in pilih]
    if kurang:
        raise ValueError(f"kolom tidak ketemu: {kurang}. Kolom file: {list(df.columns)}")
    out = pd.DataFrame({k: df[v] for k, v in pilih.items()})
    wk = out.waktu.astype(str).str.strip()
    iso = wk.str.match(r"^\d{4}-")
    out["waktu"] = pd.concat([pd.to_datetime(wk[iso], errors="coerce"),
                              pd.to_datetime(wk[~iso], errors="coerce", dayfirst=True)]).sort_index()
    for k in ("lat", "lon", "speed"):
        out[k] = pd.to_numeric(out[k].astype(str).str.replace(",", ".").str.extract(r"(-?\d+\.?\d*)")[0], errors="coerce")
    if "acc" in out:
        out["acc"] = out.acc.astype(str).str.upper().str.contains("ON|1|NYALA|TRUE")
    else:
        out["acc"] = True
    out["unit"] = out.unit.astype(str).str.strip()
    return out.dropna(subset=["waktu", "lat", "lon", "speed"])


def baca_gps():
    fs = sorted(glob.glob(P("data", "gps", "*.csv")) + glob.glob(P("data", "gps", "*.xlsx")) + glob.glob(P("data", "gps", "*.xls")))
    if not fs:
        sys.exit("Belum ada file GPS di data/gps/")
    semua = []
    for f in fs:
        try:
            df = pd.read_excel(f) if f.endswith(("xlsx", "xls")) else pd.read_csv(f, sep=None, engine="python")
            semua.append(rapikan_kolom(df)); print(f"  baca {os.path.basename(f)}: {len(semua[-1])} titik")
        except Exception as e:
            print(f"  LEWATI {os.path.basename(f)}: {e}")
    if not semua:
        sys.exit("Tidak ada file GPS yang bisa dibaca")
    return pd.concat(semua).drop_duplicates(["unit", "waktu"])


def proyeksi(g, jalur):
    c = math.cos(math.radians(jalur.lat.mean()))
    jx, jy = jalur.lon.values * K * c, jalur.lat.values * K
    gx, gy = g.lon.values * K * c, g.lat.values * K
    idx = np.empty(len(g), int); d = np.empty(len(g))
    for s in range(0, len(g), 2000):
        dd = np.hypot(gx[s:s + 2000, None] - jx[None], gy[s:s + 2000, None] - jy[None])
        idx[s:s + 2000] = dd.argmin(1); d[s:s + 2000] = dd.min(1)
    g = g.assign(sta=jalur.sta.values[idx], jarak_m=d)
    return g[g.jarak_m <= CFG["jarak_maks_ke_jalan_m"]].copy()


# ---------- status per segmen ----------
def zona_bukan_jalan(sta):
    for z in CFG["zona_bukan_jalan"]:
        if z["sta_awal"] <= sta <= z["sta_akhir"]:
            return z["nama"]
    return None


def hitung(g, jalur):
    B = CFG["batas"]; L = CFG["panjang_segmen_m"] / 1000
    akhir = g.waktu.max(); awal = akhir - pd.Timedelta(hours=CFG["jendela_jam"])
    w = g[g.waktu > awal].copy()
    w["seg"] = np.minimum((w.sta / L).astype(int), int(jalur.sta.max() / L))
    fitur, merah = [], []
    nseg = int(math.ceil(jalur.sta.max() / L))
    for i in range(nseg):
        a, b = round(i * L, 3), round(min((i + 1) * L, jalur.sta.max()), 3)
        x = w[w.seg == i]
        zona = zona_bukan_jalan((a + b) / 2)
        jalan = x[x.acc | (x.speed > 0)]                       # titik mesin hidup
        lambat = jalan[jalan.speed <= B["lambat_kmh"]]
        tertahan = x[(x.speed == 0)]
        p = dict(seg=i, sta_awal=a, sta_akhir=b, label=f"STA {fmt_sta(a)} - {fmt_sta(b)}",
                 n_titik=int(len(x)), n_unit=int(x.unit.nunique()),
                 speed_median=None if jalan.empty else round(float(jalan.speed.median()), 1),
                 unit_lambat=sorted(lambat.unit.unique().tolist()), unit_tertahan=sorted(tertahan.unit.unique().tolist()))
        if zona:
            p.update(status="abu", alasan=f"Zona {zona} (antre/parkir, tidak dihitung trigger)")
        elif len(x) < B["min_titik_segmen"]:
            p.update(status="kosong", alasan="Data GPS belum cukup")
        else:
            nl = len(set(p["unit_lambat"]) | set(p["unit_tertahan"]))
            med = p["speed_median"] if p["speed_median"] is not None else 0
            if nl >= B["min_unit_lambat_merah"] or (med <= B["merah_speed_median_kmh"] and p["n_unit"] >= B["min_unit_lambat_merah"]):
                alasan = []
                if p["unit_tertahan"]: alasan.append(f"{len(p['unit_tertahan'])} unit berhenti/tertahan")
                if p["unit_lambat"]: alasan.append(f"{len(p['unit_lambat'])} unit jalan <= {B['lambat_kmh']} km/jam")
                if med <= B["merah_speed_median_kmh"]: alasan.append(f"kecepatan umumnya {med:g} km/jam")
                p.update(status="merah", alasan="; ".join(alasan) + " - kemungkinan jalan jelek/licin/macet")
            elif med <= B["kuning_speed_median_kmh"]:
                p.update(status="kuning", alasan=f"Agak pelan, kecepatan umumnya {med:g} km/jam")
            else:
                p.update(status="hijau", alasan=f"Lancar, kecepatan umumnya {med:g} km/jam")
        lo = jalur[(jalur.sta >= a - 1e-9) & (jalur.sta <= b + 1e-9)]
        lat, lon = titik_di_sta(jalur, (a + b) / 2)
        p.update(lat=round(lat, 6), lon=round(lon, 6))
        fitur.append(dict(type="Feature", properties=p,
                          geometry=dict(type="LineString", coordinates=[[round(o, 6), round(l, 6)] for l, o in zip(lo.lat, lo.lon)])))
        if p["status"] == "merah":
            merah.append(p)
    # gabung segmen merah yang berdampingan jadi satu trigger
    trig = []
    for p in merah:
        if trig and abs(trig[-1]["sta_akhir"] - p["sta_awal"]) < 1e-6:
            t = trig[-1]; t["sta_akhir"] = p["sta_akhir"]; t["seg"].append(p["seg"])
            t["unit"] = sorted(set(t["unit"]) | set(p["unit_lambat"]) | set(p["unit_tertahan"]))
            t["alasan"].append(p["alasan"])
        else:
            trig.append(dict(sta_awal=p["sta_awal"], sta_akhir=p["sta_akhir"], seg=[p["seg"]],
                             unit=sorted(set(p["unit_lambat"]) | set(p["unit_tertahan"])), alasan=[p["alasan"]]))
    for t in trig:
        meds = [p["speed_median"] for p in merah if p["seg"] in t["seg"] and p["speed_median"] is not None]
        t["speed_terendah"] = min(meds) if meds else None
        nu = max(p["n_unit"] for p in merah if p["seg"] in t["seg"])
        t["alasan"] = ((f"{len(t['unit'])} unit melambat/tertahan" if t["unit"] else f"{nu} unit lewat pelan") +
                       (f", kecepatan paling pelan {t['speed_terendah']:g} km/jam" if meds else "") +
                       ". Kemungkinan jalan jelek, licin, atau macet.")
        t["sta_tengah"] = round((t["sta_awal"] + t["sta_akhir"]) / 2, 2)
        t["lat"], t["lon"] = [round(v, 6) for v in titik_di_sta(jalur, t["sta_tengah"])]
        t["kode"] = f"STA{int(t['sta_awal'] * 1000):05d}"           # dipakai cegah tiket dobel
        t["judul"] = f"[TRIGGER] Cek jalan STA {fmt_sta(t['sta_awal'])} - {fmt_sta(t['sta_akhir'])}"
    return fitur, trig, awal, akhir, w


def fmt_sta(s):
    km = int(s + 1e-9); m = int(round((s - km) * 1000))
    if m == 1000: km, m = km + 1, 0
    return f"{km}+{m:03d}"


def titik_penting(jalur):
    f = []
    for t in CFG["titik_penting"]:
        lat, lon = t.get("lat"), t.get("lon")
        if t.get("sta") is not None and lat is None:
            lat, lon = titik_di_sta(jalur, t["sta"])
        if lat is None: continue
        f.append(dict(type="Feature", properties=dict(nama=t["nama"], jenis=t["jenis"], sta=t.get("sta"), catatan=t.get("catatan", "")),
                      geometry=dict(type="Point", coordinates=[round(lon, 6), round(lat, 6)])))
    for s in range(0, int(jalur.sta.max()) + 1):
        lat, lon = titik_di_sta(jalur, s)
        f.append(dict(type="Feature", properties=dict(nama=f"STA {s}", jenis="sta", sta=s),
                      geometry=dict(type="Point", coordinates=[round(lon, 6), round(lat, 6)])))
    return f


def main():
    jalur = baca_jalur()
    print("Baca data GPS...")
    g = proyeksi(baca_gps(), jalur)
    print(f"  {len(g)} titik di jalur ALR, {g.unit.nunique()} unit")
    fitur, trig, awal, akhir, w = hitung(g, jalur)
    os.makedirs(P("docs", "data"), exist_ok=True)
    json.dump(dict(type="FeatureCollection", features=fitur), open(P("docs", "data", "segmen.geojson"), "w"))
    json.dump(dict(type="FeatureCollection", features=titik_penting(jalur)), open(P("docs", "data", "titik.geojson"), "w"))
    jumlah = pd.Series([x["properties"]["status"] for x in fitur]).value_counts().to_dict()
    ring = dict(nama_jalan=CFG["nama_jalan"], data_dari=str(awal), data_sampai=str(akhir), n_unit=int(w.unit.nunique()),
                n_titik=int(len(w)), jumlah_segmen=jumlah, trigger=trig, label_trigger=CFG["label_trigger"],
                label_laporan=CFG["label_laporan"], dibuat=pd.Timestamp.now(tz="Asia/Jakarta").strftime("%Y-%m-%d %H:%M WIB"))
    json.dump(ring, open(P("docs", "data", "ringkasan.json"), "w"), indent=1, default=str)
    json.dump(trig, open(P("trigger_baru.json"), "w"), indent=1)
    print(f"Data {awal} s/d {akhir}. Segmen: {jumlah}")
    for t in trig:
        print(f"  MERAH {t['judul']}: {t['alasan']} (unit: {', '.join(t['unit'])})")


if __name__ == "__main__":
    main()
