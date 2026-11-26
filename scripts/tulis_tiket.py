"""Tulis daftar tiket ALR (trigger + laporan lapangan, termasuk komentar) ke tiket.json di cabang laporan-foto.

Aplikasi membaca file ini lewat raw.githubusercontent.com, yang tidak kena batas 60 permintaan/jam
seperti GitHub API tanpa login. Jalan di Action "Ambil laporan" (tiap ~5 menit), sesudah ambil_laporan.py,
memakai token Action (batas 5000/jam). File hanya ditulis ulang kalau isinya berubah.
"""
import base64, json, os, sys, time, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ambil_laporan import gh, REPO, TOKEN, CABANG

LABEL = ["trigger", "laporan-jalan", "logistik", "pekerjaan-rm"]
NAMA = "tiket.json"


def main():
    if not (REPO and TOKEN):
        print("token belum ada, lewati"); return
    # Daftar issue GitHub telat beberapa detik setelah issue baru dibuat; tunggu sebentar
    # dan tambahkan issue terbaru yang belum muncul di daftar (cek nomor satu per satu).
    time.sleep(10)
    issues = [i for i in gh("GET", "/issues?state=all&per_page=100&sort=created&direction=desc") if "pull_request" not in i]
    ada = {i["number"] for i in issues}
    n = (max(ada) if ada else 0) + 1
    while True:
        try:
            i = gh("GET", f"/issues/{n}")
        except urllib.error.HTTPError:
            break
        if "pull_request" not in i and n not in ada:
            issues.insert(0, i)
        n += 1
    out = []
    for i in issues:
        lbl = [l["name"] for l in i.get("labels", [])]
        if not set(lbl) & set(LABEL):
            continue
        teks = i.get("body") or ""
        if i.get("comments"):
            kom = gh("GET", f"/issues/{i['number']}/comments?per_page=100")
            teks += "\n" + "\n".join((c.get("body") or "") for c in kom)
        out.append(dict(number=i["number"], title=i["title"], state=i["state"], body=i.get("body") or "", created_at=i["created_at"],
                        labels=[{"name": n} for n in lbl], comments=0, comments_url=i["comments_url"], _teks=teks))
    isi = json.dumps({"tiket": out}, ensure_ascii=False, separators=(",", ":"))
    try:
        lama = gh("GET", f"/contents/{NAMA}?ref={CABANG}")
        if base64.b64decode(lama["content"]).decode("utf-8") == isi:
            print(f"{NAMA} sama, tidak diubah ({len(out)} tiket)"); return
        sha = lama["sha"]
    except urllib.error.HTTPError:
        sha = None
    data = dict(message="Update daftar tiket ALR", branch=CABANG, content=base64.b64encode(isi.encode()).decode())
    if sha:
        data["sha"] = sha
    gh("PUT", f"/contents/{NAMA}", data)
    print(f"{NAMA} ditulis: {len(out)} tiket")


if __name__ == "__main__":
    main()
