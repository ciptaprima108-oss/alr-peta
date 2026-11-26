"""Ambil laporan dari aplikasi ALR (kotak surat Google Apps Script milik pemilik) lalu simpan ke GitHub.

Aplikasi mengirim laporan (isi + foto) ke relay di docs/lapor.json, tanpa login.
Script ini jalan tiap ~5 menit di GitHub Action: ambil laporan baru,
simpan foto ke cabang laporan-foto, buat tiket (issue) laporan, lalu beri komentar / tutup trigger
yang terkait. Laporan yang sudah diproses dicatat di cabang laporan-foto (diproses.json).
"""
import base64, json, os, re, time, urllib.parse, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.environ.get("GITHUB_REPOSITORY", "")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
CFG = json.load(open(os.path.join(ROOT, "docs", "lapor.json"), encoding="utf-8"))
RELAY = CFG.get("relay", "")
CABANG = "laporan-foto"
LABEL_BARU = ["laporan-jalan", "logistik", "pekerjaan-rm"]
LABEL_KOMENTAR = ["trigger", "laporan-jalan", "logistik", "pekerjaan-rm"]
LABEL_TUTUP = ["trigger", "logistik", "laporan-jalan", "pekerjaan-rm"]
UA = {"User-Agent": "alr-laporan"}


def gh(method, path, data=None):
    req = urllib.request.Request(f"https://api.github.com/repos/{REPO}{path}", method=method,
                                 data=None if data is None else json.dumps(data).encode(),
                                 headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json", **UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or "null")


def ambil(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def baca_status():
    try:
        f = gh("GET", f"/contents/diproses.json?ref={CABANG}")
        return json.loads(base64.b64decode(f["content"])), f["sha"]
    except urllib.error.HTTPError:
        return [], None


def simpan_status(ids, sha):
    isi = dict(message="Catat laporan yang sudah diproses", branch=CABANG,
               content=base64.b64encode(json.dumps(ids).encode()).decode())
    if sha:
        isi["sha"] = sha
    gh("PUT", "/contents/diproses.json", isi)


def proses(p):
    foto = (p.get("foto") or [])[:6]
    kom = (p.get("komentar") or [])[:3]
    baru = p.get("baru")
    if not baru and not kom:
        raise ValueError("laporan kosong")
    if baru:
        if baru.get("label") not in LABEL_BARU: raise ValueError("jenis tidak dikenal")
        if not re.match(r"^\[(INSPEKSI|LOGISTIK|PEKERJAAN RM|LAINNYA)\]", baru.get("judul", "")): raise ValueError("judul tidak sah")
    url = []
    bln = time.strftime("%Y-%m")
    for i, f in enumerate(foto):
        b = f.get("b64", "")
        if not b or len(b) > 4_000_000: raise ValueError("foto tidak sah")
        base64.b64decode(b, validate=True)
        path = f"foto/{bln}/{p.get('rid', 'x')}-{i}.jpg"
        try:
            gh("PUT", f"/contents/{path}", dict(message="Foto laporan ALR", content=b, branch=CABANG))
        except urllib.error.HTTPError as e:
            if e.code != 422: raise           # 422 = sudah ada (laporan dikirim ulang)
        ket = re.sub(r"[\[\]]", "", str(f.get("ket") or "Foto"))[:40]
        url.append(f"![{ket}](https://raw.githubusercontent.com/{REPO}/{CABANG}/{path})")
    foto_md = "\n".join(url)
    nomor = None
    if baru:
        nomor = gh("POST", "/issues", dict(title=str(baru["judul"])[:200], body=str(baru["isi"])[:20000].replace("{{FOTO}}", foto_md),
                                           labels=[baru["label"]]))["number"]
    for k in kom:
        no = int(k["nomor"])
        iss = gh("GET", f"/issues/{no}")
        lbl = [l["name"] for l in iss.get("labels", [])]
        if not set(lbl) & set(LABEL_KOMENTAR): raise ValueError(f"#{no} bukan tiket ALR")
        isi = str(k.get("isi", ""))[:20000].replace("{{FOTO}}", foto_md).replace("{{NOMOR}}", str(nomor or no))
        gh("POST", f"/issues/{no}/comments", dict(body=isi))
        if k.get("tutup") and set(lbl) & set(LABEL_TUTUP) and iss["state"] == "open":
            gh("PATCH", f"/issues/{no}", dict(state="closed", state_reason="completed"))
        nomor = nomor or no
    return nomor


def ganti_pin(p):
    """Paket ganti PIN dari aplikasi (bukan laporan). Isinya: kode, bukti = PBKDF2(PIN lama) hex,
    garam + cek untuk PIN baru. Diterima kalau sha256(bukti) sama dengan cek di docs/akun.json."""
    import hashlib
    x = p.get("pin") or {}
    kode, bukti, garam, cek = (str(x.get(k, "")) for k in ("kode", "bukti", "garam", "cek"))
    if not (re.fullmatch(r"\d{5}", kode) and re.fullmatch(r"[0-9a-f]{64}", bukti)
            and re.fullmatch(r"[0-9a-f]{32}", garam) and re.fullmatch(r"[0-9a-f]{64}", cek)):
        raise ValueError("paket PIN tidak sah")
    for _ in range(3):                                   # ambil versi terbaru, ulang kalau bentrok dengan commit lain
        f = gh("GET", "/contents/docs/akun.json?ref=main")
        d = json.loads(base64.b64decode(f["content"]))
        a = d.get("akun", {}).get(kode)
        if not a:
            raise ValueError("No. ID tidak dikenal")
        if hashlib.sha256(bytes.fromhex(bukti)).hexdigest() != a.get("cek"):
            raise ValueError("bukti PIN lama tidak cocok")
        d["akun"][kode] = dict(garam=garam, cek=cek, awal=False)
        isi = json.dumps(d, indent=1, ensure_ascii=False) + "\n"
        try:
            gh("PUT", "/contents/docs/akun.json", dict(message=f"Ganti PIN {kode}", branch="main", sha=f["sha"],
                                                       content=base64.b64encode(isi.encode()).decode()))
            break
        except urllib.error.HTTPError as e:
            if e.code != 409: raise
            time.sleep(3)
    else:
        raise ValueError("akun.json sibuk, coba lagi")
    return kode


def main():
    if not (RELAY and TOKEN and REPO):
        print("relay belum diatur, lewati"); return
    st, sha = baca_status()
    if isinstance(st, list):
        st = dict(ids=st, sejak=0)
    ids = st.get("ids", [])
    sejak = st.get("sejak") or int((time.time() - 3 * 86400) * 1000)
    baru = 0
    pin_baru = []
    for _ in range(20):
        daftar = json.loads(ambil(f"{RELAY}?sejak={sejak}")).get("laporan", [])
        for x in daftar:
            p, rid = x["p"], str(x["p"].get("rid", ""))
            sejak = max(sejak, int(x["t"]))
            if rid in ids:
                continue
            if (p.get("baru") or {}).get("label") == "ganti-pin":      # bukan laporan: jangan jadi tiket
                try:
                    pin_baru.append(ganti_pin(p)); print(f"  PIN {rid} diganti")
                except Exception as e:
                    print(f"  PIN {rid} ditolak: {e}")
                ids.append(rid)
                continue
            try:
                no = proses(p); baru += 1
                print(f"  laporan {rid} -> #{no}")
            except Exception as e:
                print(f"  laporan {rid} ditolak: {e}")
            ids.append(rid)
        if len(daftar) < 10:
            break
    if baru or pin_baru or sejak != st.get("sejak"):
        simpan_status(dict(ids=ids[-1000:], sejak=sejak), sha)
    if pin_baru:                                          # tayangkan akun.json baru (commit dari Action tidak memicu Pages)
        try:
            gh("POST", "/actions/workflows/peta.yml/dispatches", dict(ref="main"))
        except urllib.error.HTTPError as e:
            print(f"  gagal memicu peta.yml: {e.code}")
    print(f"Laporan baru: {baru}")
    return baru


if __name__ == "__main__":
    main()
