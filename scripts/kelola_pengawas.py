"""Proses tiket [PENGAWAS] dari menu Kelola pengawas: tambah/hapus pengawas di config.json.
Jalan otomatis di GitHub Action saat tiket berlabel kelola-pengawas dibuat.
Hanya diproses kalau pembuat tiket punya akses tulis (admin/maintain/write) ke repo.
"""
import json, os, re, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO, TOKEN = os.environ["GITHUB_REPOSITORY"], os.environ["GITHUB_TOKEN"]
EV = json.load(open(os.environ["GITHUB_EVENT_PATH"], encoding="utf-8"))
ISSUE = EV["issue"]


def api(method, path, data=None, root=False):
    url = ("https://api.github.com" if root else f"https://api.github.com/repos/{REPO}") + path
    req = urllib.request.Request(url, method=method, data=None if data is None else json.dumps(data).encode(),
                                 headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or "null")


def balas(teks, tutup=True):
    api("POST", f"/issues/{ISSUE['number']}/comments", dict(body=teks))
    if tutup:
        api("PATCH", f"/issues/{ISSUE['number']}", dict(state="closed"))


def field(judul):
    m = re.search(rf"### {judul}\s*\n+(.+?)(?:\n###|\Z)", ISSUE.get("body") or "", re.S)
    v = m.group(1).strip() if m else ""
    return "" if v == "_No response_" else v


def main():
    pembuat = ISSUE["user"]["login"]
    try:
        izin = api("GET", f"/collaborators/{pembuat}/permission")["permission"]
    except urllib.error.HTTPError:
        izin = "none"
    if izin not in ("admin", "maintain", "write"):
        return balas(f"❌ @{pembuat} belum punya akses admin di repo ini, jadi permintaan tidak diproses. Minta admin/tim development yang buat.")
    aksi = field("Aksi")
    user = field("Username GitHub pengawas").lstrip("@").strip()
    if not re.fullmatch(r"[A-Za-z0-9-]{1,39}", user):
        return balas(f"❌ Username `{user}` tidak valid.")
    try:
        user = api("GET", f"/users/{user}", root=True)["login"]
    except urllib.error.HTTPError:
        return balas(f"❌ Akun GitHub `{user}` tidak ditemukan. Pastikan pengawas sudah daftar di github.com/signup.")
    f = os.path.join(ROOT, "config.json")
    cfg = json.load(open(f, encoding="utf-8"))
    daftar = [p if isinstance(p, dict) else {"username": p} for p in cfg.get("pengawas_github", [])]
    ada = [p for p in daftar if p["username"].lower() == user.lower()]
    if aksi == "Tambah":
        if ada:
            daftar.remove(ada[0])
        daftar.append({"username": user, "nama": field("Nama"), "jabatan": field("Jabatan")})
        pesan = f"✅ @{user} ditambahkan sebagai pengawas. Tiket trigger berikutnya akan mengirim notif ke akun ini."
    else:
        if not ada:
            return balas(f"ℹ️ @{user} memang tidak ada di daftar pengawas.")
        daftar.remove(ada[0])
        pesan = f"✅ @{user} dihapus dari daftar pengawas."
    cfg["pengawas_github"] = daftar
    json.dump(cfg, open(f, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    open(os.environ.get("GITHUB_OUTPUT", os.devnull), "a").write(f"pesan={pesan}\n")
    print(pesan)


if __name__ == "__main__":
    main()
