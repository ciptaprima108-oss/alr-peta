"""Bikin tiket GitHub (issue) untuk tiap trigger merah, dan kirim notif ke pengawas.

Jalan otomatis di GitHub Action setelah hitung_trigger.py.
Env: GITHUB_TOKEN, GITHUB_REPOSITORY (otomatis dari Action)
     TELEGRAM_TOKEN, TELEGRAM_CHAT_ID (opsional, isi di Settings > Secrets kalau mau notif Telegram)
"""
import json, os, re, sys, urllib.request, urllib.parse, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(ROOT, "config.json"), encoding="utf-8"))
TRIG = json.load(open(os.path.join(ROOT, "trigger_baru.json"), encoding="utf-8"))
RING = json.load(open(os.path.join(ROOT, "docs", "data", "ringkasan.json"), encoding="utf-8"))
REPO = os.environ.get("GITHUB_REPOSITORY", "")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
OWNER, NAMA = (REPO.split("/") + [""])[:2]
PETA = f"https://{OWNER}.github.io/{NAMA}/"


def api(method, path, data=None):
    req = urllib.request.Request(f"https://api.github.com/repos/{REPO}{path}", method=method,
                                 data=None if data is None else json.dumps(data).encode(),
                                 headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or "null")


def telegram(teks):
    tok, chat = os.environ.get("TELEGRAM_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not (tok and chat):
        return
    try:
        urllib.request.urlopen(f"https://api.telegram.org/bot{tok}/sendMessage",
                               data=urllib.parse.urlencode(dict(chat_id=chat, text=teks, disable_web_page_preview="true")).encode())
    except Exception as e:
        print("Telegram gagal:", e)


def pastikan_label():
    for nama, warna, ket in ((CFG["label_trigger"], "d73a4a", "Trigger otomatis: unit melambat/tertahan"),
                             (CFG["label_laporan"], "0e8a16", "Laporan lapangan jalan ALR")):
        try:
            api("POST", "/labels", dict(name=nama, color=warna, description=ket))
        except Exception:
            pass   # sudah ada


def main():
    if not TOKEN or not REPO:
        sys.exit("GITHUB_TOKEN / GITHUB_REPOSITORY kosong (jalankan di GitHub Action)")
    pastikan_label()
    buka = api("GET", f"/issues?state=open&labels={CFG['label_trigger']}&per_page=100")
    ada = []
    for i in buka:
        m = re.search(r"<!-- sta:([\d.]+)-([\d.]+) -->", i.get("body") or "")
        if m:
            ada.append((float(m.group(1)), float(m.group(2)), i))
    mention = " ".join("@" + u for u in CFG["pengawas_github"])
    for t in TRIG:
        lama = [i for a, b, i in ada if a <= t["sta_akhir"] + 0.2 and b >= t["sta_awal"] - 0.2]
        gmaps = f"https://www.google.com/maps?q={t['lat']},{t['lon']}"
        info = (f"**Lokasi:** {t['judul'].replace('[TRIGGER] Cek jalan ', '')}  \n"
                f"**Koordinat:** [{t['lat']}, {t['lon']}]({gmaps}) (klik untuk navigasi)  \n"
                f"**Alasan:** {t['alasan']}  \n"
                f"**Unit:** {', '.join(t['unit'])}  \n"
                f"**Data GPS:** {RING['data_dari']} s/d {RING['data_sampai']}  \n"
                f"**Peta:** {PETA}")
        if lama:
            no = lama[0]["number"]
            kom = api("GET", f"/issues/{no}/comments?per_page=100")
            if any(RING["data_sampai"] in (x.get("body") or "") for x in [lama[0]] + kom):
                continue                         # data ini sudah pernah dilaporkan
            api("POST", f"/issues/{no}/comments", dict(body=f"Trigger muncul lagi di data terbaru.\n\n{info}"))
            print(f"  update tiket #{no}")
            continue
        body = (f"<!-- sta:{t['sta_awal']}-{t['sta_akhir']} -->\n"
                f"## Trigger jalan merah\n\n{info}\n\n"
                f"### Tugas pengawas ALR / RM {mention}\n"
                f"1. Datang ke titik (klik link koordinat di atas).\n"
                f"2. Ambil **foto dan video** kondisi jalan (lubang, licin, amblas, genangan, antrean, dll).\n"
                f"3. Balas tiket ini: tarik/tempel foto & video ke kolom komentar, lalu tulis kondisi + tindakan.\n"
                f"4. Kalau sudah ditangani, tutup tiket (Close issue).\n")
        isi = dict(title=t["judul"], body=body, labels=[CFG["label_trigger"]], assignees=CFG["pengawas_github"])
        try:
            i = api("POST", "/issues", isi)
        except urllib.error.HTTPError:          # pengawas belum jadi collaborator -> tanpa assignee
            isi.pop("assignees"); i = api("POST", "/issues", isi)
        print(f"  tiket baru #{i['number']} {t['judul']}")
        telegram(f"🔴 {t['judul']}\n{t['alasan']}\nUnit: {', '.join(t['unit'])}\nNavigasi: {gmaps}\n"
                 f"Upload foto/video di: {i['html_url']}")


if __name__ == "__main__":
    main()
