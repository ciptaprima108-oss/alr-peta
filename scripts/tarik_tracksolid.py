"""Tarik titik GPS terbaru dari TrackSolid Pro (Jimi IoT Open API).

Dijalankan GitHub Actions tiap 30 menit. Hasil disimpan ke
data/gps/live_tracksolid.csv (kolom unit, waktu, lat, lon, speed, acc) yang
TIDAK di-commit (ada di .gitignore); file itu disimpan antar-run lewat cache
GitHub Actions supaya repo tidak membengkak.

Kunci API diambil dari GitHub Secrets (jangan pernah ditulis di repo):
  TS_APP_KEY, TS_APP_SECRET   dari Jimi / dealer TrackSolid (menu Open API)
  TS_USER + TS_PASS_MD5       akun 1 TrackSolid Pro (atau TS_PASS polos)
  TS2_USER + TS2_PASS_MD5     akun 2 (opsional)
  TS_URL (opsional)           default https://hk-open.tracksolidpro.com/route/rest
  TS_MAPPING_CSV (opsional)   link CSV tab TRACKSOLID MAPPING (IMEI -> No Lambung)
Nilai-nilai ini sama dengan Script Properties di Apps Script "Tracking GPS WHL"
(TS_APP_KEY, TS_APP_SECRET, TS_ACCOUNT, TS_USER_PWD_MD5, TS2_ACCOUNT, TS2_USER_PWD_MD5).

Isi file:
  - 3 hari terakhir: semua titik, maks 1 titik / menit / unit
  - lebih lama (sampai 60 hari): 1 titik / jam / unit (sama seperti export per jam)
Hanya titik di sekitar koridor ALR yang disimpan.

GPS RAPAT (per menit, sejak 25 Nov 2026): Apps Script "Tracking GPS WHL" (GpsRapatAlr.gs) menarik
jimi.device.track.list tiap 15 menit ke tab GPS ALR RAPAT di sheet data ban (48 jam terakhir).
tarik_rapat() membacanya lewat gviz (TS_SHEET_ID) dan menyimpan arsip per hari WIB di
data/gps/rapat/YYYY-MM-DD.csv.gz (kolom unit, waktu, lat, lon, speed, acc, area).
"""
import csv, hashlib, json, os, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)
CFG = json.load(open(P("config.json"), encoding="utf-8")).get("tracksolid", {})
OUT = P("data", "gps", "live_tracksolid.csv")
ZONA = timezone(timedelta(hours=CFG.get("zona_jam", 7)))       # WIB
URL = os.environ.get("TS_URL") or CFG.get("url", "https://hk-open.tracksolidpro.com/route/rest")
KEY, SECRET = os.environ.get("TS_APP_KEY", ""), os.environ.get("TS_APP_SECRET", "")

def akun_dari_env():
    """Akun 1 = TS_*, akun 2 (opsional) = TS2_*. Password boleh polos (TS_PASS) atau MD5 (TS_PASS_MD5)."""
    out = []
    for pf in ("TS", "TS2"):
        u = os.environ.get(pf + "_USER", "")
        md5 = os.environ.get(pf + "_PASS_MD5", "") or (hashlib.md5(os.environ[pf + "_PASS"].encode()).hexdigest()
                                                       if os.environ.get(pf + "_PASS") else "")
        if u and md5:
            out.append((u, md5.lower()))
    return out


AKUN = akun_dari_env()


def keluar(lanjut, pesan):
    print(pesan)
    if os.environ.get("GITHUB_OUTPUT"):
        open(os.environ["GITHUB_OUTPUT"], "a").write(f"lanjut={'true' if lanjut else 'false'}\n")
    sys.exit(0)


def panggil(method, **p):
    p.update(method=method, app_key=KEY, sign_method="md5", v="1.0", format="json",
             timestamp=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
    p = {k: str(v) for k, v in p.items() if v is not None}
    s = SECRET + "".join(k + p[k] for k in sorted(p)) + SECRET
    p["sign"] = hashlib.md5(s.encode()).hexdigest().upper()
    req = urllib.request.Request(URL, data=urllib.parse.urlencode(p).encode(),
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    for coba in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                j = json.loads(r.read())
            break
        except Exception as e:
            if coba == 2: raise
            print(f"  ulang {method}: {e}"); time.sleep(5)
    if str(j.get("code")) != "0":
        raise RuntimeError(f"{method}: kode {j.get('code')} {j.get('message')}")
    return j.get("result")


def koridor():
    j = pd.read_csv(P("data", "jalur_sta.csv"))
    m = CFG.get("margin_derajat", 0.02)            # ~2 km
    return j.lat.min() - m, j.lat.max() + m, j.lon.min() - m, j.lon.max() + m


def baca_mapping():
    """IMEI -> No Lambung dari tab TRACKSOLID MAPPING (sheet sama dgn Apps Script). URL CSV di secret TS_MAPPING_CSV."""
    url = os.environ.get("TS_MAPPING_CSV", "")
    if not url:
        return {}
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            rows = list(csv.reader(r.read().decode("utf-8-sig").splitlines()))
        h = [c.strip().lower() for c in rows[0]]
        iu, ii = h.index("no lambung whl"), h.index("imei")
        m = {r[ii].strip(): r[iu].strip() for r in rows[1:] if len(r) > max(iu, ii) and r[iu].strip()}
        print(f"mapping No Lambung: {len(m)} unit"); return m
    except Exception as ex:
        print(f"  mapping gagal dibaca ({ex}), pakai nama device"); return {}


def ke_lokal(t):
    """Waktu dari API (UTC) -> string waktu lokal WIB."""
    d = datetime.strptime(str(t)[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    return d.astimezone(ZONA).strftime("%Y-%m-%d %H:%M:%S")


def angka(x, d=0.0):
    try: return float(x)
    except (TypeError, ValueError): return d


def tarik_sheet(sejak):
    """Cadangan tanpa kunci API: tab LOG TRACKSOLID di Google Sheet (diisi Apps Script tiap jam).
    Sheet ID di secret TS_SHEET_ID (sheet bisa dibuka siapa saja yg punya link, jadi ID jangan ditulis di repo)."""
    sid = os.environ.get("TS_SHEET_ID", "")
    if not sid:
        return None
    q = "select A,B,E,F,G,H where A > datetime '" + sejak.strftime("%Y-%m-%d %H:%M:%S") + "'"
    url = (f"https://docs.google.com/spreadsheets/d/{sid}/gviz/tq?tqx=out:csv&sheet="
           + urllib.parse.quote("LOG TRACKSOLID") + "&tq=" + urllib.parse.quote(q))
    with urllib.request.urlopen(url, timeout=120) as r:
        rows = list(csv.reader(r.read().decode("utf-8-sig").splitlines()))
    out = []
    for x in rows[1:]:
        if len(x) < 6: continue
        w, unit, lat, lon, sp, acc = x[:6]
        try:
            t = datetime.strptime(w.strip(), "%d/%m/%Y %H:%M")
        except ValueError:
            continue
        out.append([unit.strip(), t.strftime("%Y-%m-%d %H:%M:%S"), angka(lat.replace(",", ".")),
                    angka(lon.replace(",", ".")), angka(sp.replace(",", ".")), acc.strip().upper()])
    print(f"sheet LOG TRACKSOLID: {len(out)} baris sejak {sejak:%Y-%m-%d %H:%M} WIB")
    return out


RAPAT_DIR = P("data", "gps", "rapat")
RAPAT_KOLOM = ["unit", "waktu", "lat", "lon", "speed", "acc", "area"]


def baca_rapat_lokal():
    import glob
    fs = sorted(glob.glob(os.path.join(RAPAT_DIR, "*.csv.gz")))
    return pd.concat([pd.read_csv(f, dtype=str) for f in fs[-3:]]) if fs else pd.DataFrame(columns=RAPAT_KOLOM)


def tarik_rapat():
    """Titik per menit dari tab GPS ALR RAPAT -> data/gps/rapat/<tgl>.csv.gz. Return jumlah baris baru."""
    sid = os.environ.get("TS_SHEET_ID", "")
    if not sid:
        print("GPS rapat: TS_SHEET_ID kosong, lewati"); return 0
    lama = baca_rapat_lokal()
    sekarang = datetime.now(ZONA).replace(tzinfo=None)
    sejak = sekarang - timedelta(hours=47)
    if len(lama):
        sejak = max(sejak, datetime.strptime(lama.waktu.max(), "%Y-%m-%d %H:%M:%S") - timedelta(hours=2))
    q = "select A,B,C,D,E,F,H where A > datetime '" + sejak.strftime("%Y-%m-%d %H:%M:%S") + "'"
    url = (f"https://docs.google.com/spreadsheets/d/{sid}/gviz/tq?tqx=out:csv&sheet="
           + urllib.parse.quote("GPS ALR RAPAT") + "&tq=" + urllib.parse.quote(q))
    try:
        with urllib.request.urlopen(url, timeout=180) as r:
            rows = list(csv.reader(r.read().decode("utf-8-sig").splitlines()))
    except Exception as ex:
        print(f"GPS rapat: gagal baca sheet ({ex})"); return 0
    out = []
    for x in rows[1:]:
        if len(x) < 6: continue
        w = x[0].strip()
        for fmt in ("%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M"):
            try: t = datetime.strptime(w, fmt); break
            except ValueError: t = None
        if t is None: continue
        area = (x[6] if len(x) > 6 else "").strip()
        area = area[:-2] if area.endswith(",0") or area.endswith(".0") else area
        out.append([x[1].strip(), t.strftime("%Y-%m-%d %H:%M:%S"), angka(x[2].replace(",", ".")), angka(x[3].replace(",", ".")),
                    angka(x[4].replace(",", ".")), x[5].strip().upper(), area])
    baru = pd.DataFrame(out, columns=RAPAT_KOLOM)
    print(f"GPS rapat: {len(baru)} baris dari sheet sejak {sejak:%Y-%m-%d %H:%M} WIB")
    if baru.empty:
        return 0
    os.makedirs(RAPAT_DIR, exist_ok=True)
    baru["tg"] = baru.waktu.str[:10]
    n_baru = 0
    for tg, x in baru.groupby("tg"):
        f = os.path.join(RAPAT_DIR, f"{tg}.csv.gz")
        ada = pd.read_csv(f, dtype=str) if os.path.exists(f) else pd.DataFrame(columns=RAPAT_KOLOM)
        g = pd.concat([ada, x[RAPAT_KOLOM].astype(str)], ignore_index=True)
        g = g.drop_duplicates(["unit", "waktu"], keep="last").sort_values(["waktu", "unit"])
        n_baru += len(g) - len(ada)
        g.to_csv(f, index=False, compression={"method": "gzip", "mtime": 0})
    # arsip lebih dari simpan_hari dibuang
    import glob
    batas = (sekarang - timedelta(days=CFG.get("simpan_hari", 60))).strftime("%Y-%m-%d")
    for f in glob.glob(os.path.join(RAPAT_DIR, "*.csv.gz")):
        if os.path.basename(f)[:10] < batas: os.remove(f)
    print(f"GPS rapat: {n_baru} baris baru, arsip {sorted(baru.tg.unique())}")
    return n_baru


def simpan(lama, baru):
    la0, la1, lo0, lo1 = koridor()
    df = pd.DataFrame(baru, columns=["unit", "waktu", "lat", "lon", "speed", "acc"])
    df = df[df.lat.between(la0, la1) & df.lon.between(lo0, lo1)]
    print(f"{len(df)} titik baru di koridor ALR")

    g = pd.concat([lama.astype({"lat": float, "lon": float, "speed": float}), df], ignore_index=True)
    if g.empty:
        keluar(False, "Belum ada titik GPS di koridor ALR. Lewati.")
    g["t"] = pd.to_datetime(g.waktu)
    batas_rapat = g.t.max() - pd.Timedelta(days=CFG.get("simpan_rapat_hari", 3))
    batas_buang = g.t.max() - pd.Timedelta(days=CFG.get("simpan_hari", 60))
    g = g[g.t > batas_buang].sort_values(["unit", "t"], kind="stable")
    g["kunci"] = g.t.dt.floor("min").where(g.t > batas_rapat, g.t.dt.floor("h"))
    g = g.drop_duplicates(["unit", "kunci"], keep="last")
    g[["unit", "waktu", "lat", "lon", "speed", "acc"]].sort_values(["waktu", "unit"]).to_csv(OUT, index=False, quoting=csv.QUOTE_MINIMAL)
    print(f"live_tracksolid.csv: {len(g)} titik, {g.unit.nunique()} unit, sampai {g.waktu.max()} WIB")
    keluar(True, "OK")



def main():
    lama = pd.read_csv(OUT, dtype=str) if os.path.exists(OUT) else pd.DataFrame(columns=["unit", "waktu", "lat", "lon", "speed", "acc"])
    tarik_rapat()
    if not (KEY and SECRET and AKUN):
        jam = CFG.get("tarik_awal_jam", 24) if lama.empty else 6
        baru = tarik_sheet(datetime.now(ZONA).replace(tzinfo=None) - timedelta(hours=jam))
        if baru is None:
            keluar(os.environ.get("GITHUB_EVENT_NAME") != "schedule",
                   "Kunci TrackSolid & TS_SHEET_ID belum diisi di GitHub Secrets. Lewati.")
        simpan(lama, baru)
    sekarang = datetime.now(timezone.utc)
    if len(lama):
        akhir = datetime.strptime(lama.waktu.max(), "%Y-%m-%d %H:%M:%S").replace(tzinfo=ZONA).astimezone(timezone.utc)
        mulai = max(akhir - timedelta(minutes=10), sekarang - timedelta(hours=24))
    else:
        mulai = sekarang - timedelta(hours=CFG.get("tarik_awal_jam", 24))

    peta_nama = baca_mapping()
    awalan = CFG.get("filter_nama", "")
    sesi, nama = [], {}                     # sesi = [(token, akun)], nama = imei -> (No Lambung, token)
    for user, md5 in AKUN:
        try:
            tok = panggil("jimi.oauth.token.get", user_id=user, user_pwd_md5=md5, expires_in=7200)["accessToken"]
        except Exception as ex:
            print(f"  login akun gagal: {ex}"); continue
        sesi.append((tok, user))
        alat = panggil("jimi.user.device.list", access_token=tok, target=user) or []
        for a in alat:
            imei = str(a.get("imei"))
            n = peta_nama.get(imei) or (a.get("deviceName") or a.get("vehicleNumber") or imei).strip()
            if (not awalan or n.upper().startswith(awalan.upper())) and imei not in nama:
                nama[imei] = (n, tok)
        print(f"akun {len(sesi)}: {len(alat)} alat")
    if not sesi:
        raise SystemExit("Semua login TrackSolid gagal")
    print(f"{len(nama)} unit dipakai")

    baru = []

    # 1) posisi terakhir semua unit (1 panggilan) - cadangan kalau riwayat gagal
    lokasi = []
    for tok, user in sesi:
        try: lokasi += panggil("jimi.user.device.location.list", access_token=tok, target=user, map_type="GOOGLE") or []
        except Exception as ex: print(f"  posisi terakhir gagal: {ex}")
    for x in lokasi:
        x["imei"] = str(x.get("imei"))
        if x["imei"] in nama and x.get("gpsTime"):
            baru.append([nama[x["imei"]][0], ke_lokal(x["gpsTime"]), angka(x.get("lat")), angka(x.get("lng")),
                         angka(x.get("speed")), "ON" if str(x.get("accStatus")) == "1" else "OFF"])

    # 2) riwayat jalan tiap unit sejak tarikan terakhir (titik rapat, buat deteksi melambat)
    b, e = mulai.strftime("%Y-%m-%d %H:%M:%S"), sekarang.strftime("%Y-%m-%d %H:%M:%S")
    gagal = 0
    for imei, (n, tok) in nama.items():
        try:
            for x in panggil("jimi.device.track.list", access_token=tok, imei=imei,
                             begin_time=b, end_time=e, map_type="GOOGLE") or []:
                sp = angka(x.get("gpsSpeed", x.get("speed")))
                # titik riwayat hanya terekam saat mesin hidup -> anggap ON (berhenti di jalan tetap kehitung)
                baru.append([n, ke_lokal(x["gpsTime"]), angka(x.get("lat")), angka(x.get("lng")), sp, "ON"])
        except Exception as ex:
            gagal += 1
            if gagal <= 3: print(f"  riwayat {n} gagal: {ex}")
        time.sleep(CFG.get("jeda_detik", 0.3))
    if gagal: print(f"  riwayat gagal untuk {gagal} unit (posisi terakhir tetap dipakai)")

    simpan(lama, baru)


if __name__ == "__main__":
    main()
