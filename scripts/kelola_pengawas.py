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


DIVISI = ["Pimpinan", "Road Maintenance", "Logistik"]
AKSES = {"lihat", "lapor", "kelola"}
AKSES_BAWAAN = {"Pimpinan": ["lihat", "lapor", "kelola"], "Road Maintenance": ["lihat", "lapor"], "Logistik": ["lihat"]}


def cek_username(user):
    user = user.lstrip("@").strip()
    if not user:
        return ""
    if not re.fullmatch(r"[A-Za-z0-9-]{1,39}", user):
        raise ValueError(f"Username `{user}` tidak valid.")
    try:
        return api("GET", f"/users/{user}", root=True)["login"]
    except urllib.error.HTTPError:
        raise ValueError(f"Akun GitHub `{user}` tidak ditemukan. Pastikan sudah daftar di github.com/signup.")


def main():
    pembuat = ISSUE["user"]["login"]
    try:
        izin = api("GET", f"/collaborators/{pembuat}/permission")["permission"]
    except urllib.error.HTTPError:
        izin = "none"
    if izin not in ("admin", "maintain", "write"):
        return balas(f"❌ @{pembuat} belum punya akses kelola di repo ini, jadi permintaan tidak diproses.")
    aksi = (field("Aksi") or "").strip().lower()
    aksi = "Tambah" if aksi.startswith("tambah") else "Ubah" if aksi.startswith("ubah") else "Hapus" if aksi.startswith("hapus") else ""
    if not aksi:
        return balas("❌ Isian Aksi harus Tambah, Ubah, atau Hapus.")
    f = os.path.join(ROOT, "config.json")
    cfg = json.load(open(f, encoding="utf-8"))
    daftar = cfg.get("pengguna", [])
    for p in cfg.pop("pengawas_github", []):            # data lama -> pengguna
        p = p if isinstance(p, dict) else {"username": p}
        daftar.append(dict(nama=p.get("nama") or p["username"], divisi="Road Maintenance", jabatan=p.get("jabatan", ""), username=p["username"], akses=["lihat", "lapor"]))
    for i, p in enumerate(daftar):
        p.setdefault("id", "")
    def id_baru():
        n = max([int(p["id"][4:]) for p in daftar if re.fullmatch(r"ALR-\d+", p.get("id", ""))] or [0]) + 1
        return f"ALR-{n:03d}"
    for p in daftar:
        if not p["id"]:
            p["id"] = id_baru()

    pid = (field("ID") or "").strip().upper()
    nama = (field("Nama") or "").strip()
    user_lama = (field("Username GitHub pengawas") or "").strip()  # form lama
    try:
        user = cek_username(field("Username GitHub") or user_lama)
    except ValueError as e:
        return balas(f"❌ {e}")
    cari = [p for p in daftar if (pid and p["id"] == pid) or (not pid and user and p.get("username", "").lower() == user.lower())]

    if aksi == "Hapus":
        if not cari:
            return balas("ℹ️ Pengguna itu memang tidak ada di daftar.")
        daftar.remove(cari[0])
        pesan = f"✅ {cari[0]['nama']} ({cari[0]['id']}) dihapus."
    else:
        divisi = (field("Divisi") or ("Road Maintenance" if user_lama else "")).strip()
        if divisi not in DIVISI:
            return balas(f"❌ Divisi harus salah satu: {', '.join(DIVISI)}.")
        akses = [a.strip().lower() for a in re.split(r"[,\s]+", field("Akses") or "") if a.strip().lower() in AKSES] or AKSES_BAWAAN[divisi]
        if not nama and not user:
            return balas("❌ Nama wajib diisi.")
        data = dict(nama=nama or user, divisi=divisi, jabatan=(field("Jabatan") or "").strip(), username=user, akses=sorted(set(akses), key=["lihat", "lapor", "kelola"].index))
        if aksi == "Ubah" or cari:
            if not cari:
                return balas(f"❌ Pengguna {pid} tidak ditemukan.")
            cari[0].update(data)
            pesan = f"✅ Data {data['nama']} ({cari[0]['id']}) diperbarui."
        else:
            data = dict(id=id_baru(), **data)
            daftar.append(data)
            pesan = f"✅ {data['nama']} ditambahkan dengan nomor {data['id']}."
    cfg["pengguna"] = daftar
    json.dump(cfg, open(f, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    open(os.environ.get("GITHUB_OUTPUT", os.devnull), "a").write(f"pesan={pesan}\n")
    print(pesan)


if __name__ == "__main__":
    main()
