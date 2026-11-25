"""Laporan harian jalan ALR (PDF + JPG) untuk 1 tanggal, hari tambang 06:00 - 06:00 besok.

Input :
  --gps  CSV GPS per jam (kolom unit/No Lambung, waktu/Waktu Catat, lat, lon/Lng, speed, acc)
         bawaan: semua file data/gps/*.csv (+ live_tracksolid.csv kalau ada)
  --rit  CSV ritase (tab RITASE GPS: No Lambung, Rute, Berangkat (Selesai Muat), Tiba (Bongkar), ...)
         bawaan: data/rit/ritase_gps.csv kalau ada
  --laporan  JSON laporan lapangan (opsional, daftar {judul, waktu, tim})
Output: laporan/Laporan_Harian_ALR_<tgl>.pdf + halaman JPG (hal1 = ringkasan, cocok buat WA)

Pakai: python scripts/laporan_harian.py --tgl 2026-11-24
"""
import argparse, glob, json, os, sys
import numpy as np, pandas as pd
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt, matplotlib.dates as md
from matplotlib.backends.backend_pdf import PdfPages

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hitung_trigger as ht  # baca_jalur, proyeksi, rapikan_kolom, CFG

STA_BSR = 29
BULAN = "Jan Feb Mar Apr Mei Jun Jul Agu Sep Okt Nov Des".split()
HARI = "Senin Selasa Rabu Kamis Jumat Sabtu Minggu".split()
MERAH, ORANYE, HIJAU, ABU, GELAP = "#dc2828", "#f59e0b", "#16a046", "#9ca3af", "#1e293b"
plt.rcParams.update({"font.family": "DejaVu Sans"})


def tgl_id(t, hari=True):
    s = f"{t.day} {BULAN[t.month - 1]} {t.year}"
    return f"{HARI[t.weekday()]}, {s}" if hari else s


def wr(v):
    return MERAH if v <= 13 else ORANYE if v <= 17 else HIJAU


def baca_gps(paths):
    fs = paths or sorted(glob.glob(ht.P("data", "gps", "*.csv")))
    out = []
    for f in fs:
        try:
            df = pd.read_csv(f, sep=None, engine="python")
            df = df.rename(columns={"No Lambung": "unit", "Waktu Catat": "waktu", "Lng": "lon", "Speed (km/h)": "speed", "ACC": "acc"})
            out.append(ht.rapikan_kolom(df))
        except Exception as e:
            print("  lewati", f, e)
    return pd.concat(out).drop_duplicates(["unit", "waktu"]) if out else pd.DataFrame()


def baca_rit(path):
    if not path or not os.path.exists(path):
        return pd.DataFrame(columns=["unit", "b", "t", "durasi", "muat"])
    r = pd.read_csv(path)
    r = r[r["Rute"].astype(str).str.replace(" ", "").str.upper() == "BSR-107"]
    r = pd.DataFrame({"unit": r["No Lambung"].astype(str).str.strip(),
                      "b": pd.to_datetime(r["Berangkat (Selesai Muat)"], errors="coerce"),
                      "t": pd.to_datetime(r["Tiba (Bongkar)"], errors="coerce"),
                      "muat": pd.to_numeric(r.get("Lama di Lokasi Muat (menit)"), errors="coerce")})
    r["durasi"] = (r.t - r.b).dt.total_seconds() / 60
    return r.dropna(subset=["b", "t"])


def ruas_speed(g, lebar=3):
    jalan = g[(g.speed > 3)]
    out = []
    for a in range(0, STA_BSR, lebar):
        b = min(a + lebar, STA_BSR); x = jalan[(jalan.sta >= a) & (jalan.sta < b)]
        out.append((b, a, float(x.speed.median()) if len(x) >= 2 else None, len(x)))
    return out


def berhenti(g):
    d = g[(g.speed <= 3) & (g.sta >= 0.5)].copy()  # STA 0-0,5 = area 107 (parkir), tidak dihitung
    d["seg"] = np.floor(d.sta).clip(0, STA_BSR - 1).astype(int)
    on = d[d.acc].groupby("seg").size().reindex(range(STA_BSR), fill_value=0)
    off = d[~d.acc].groupby("seg").size().reindex(range(STA_BSR), fill_value=0)
    return d, on, off


def temuan(g, d, on, off, ruas, rit, batas_lambat):
    out = []
    # 1. tempat berhenti mesin hidup terbanyak (di luar zona antrean/parkir)
    jalan = d[d.acc & ~d.sta.apply(lambda s: bool(ht.zona_bukan_jalan(s)))]
    if len(jalan):
        top = jalan.groupby("seg").agg(n=("unit", "size"), u=("unit", lambda x: sorted(set(x)))).sort_values("n", ascending=False).head(3)
        for seg, x in top.iterrows():
            if x.n < 2: continue
            out.append((MERAH, f"STA {seg}-{seg + 1}: {x.n} jam unit berhenti mesin hidup.",
                        "Unit: " + ", ".join(u.replace("WHL ", "") for u in x.u) + ". Kemungkinan antre, tertahan, atau jalan jelek."))
    # 2. antrean BSR / Stockpile Utara
    q = d[d.acc & (d.sta >= 26.2)]
    if len(q):
        out.append((ORANYE, f"STA 26-29 (Stockpile Utara - pintu BSR): {len(q)} jam unit antre mesin hidup.", f"{q.unit.nunique()} unit."))
    # 3. ruas paling pelan & lancar
    ok = [r for r in ruas if r[2] is not None]
    if ok:
        p = min(ok, key=lambda r: r[2]); l = [r for r in ok if r[2] > 17]
        out.append((wr(p[2]), f"STA {p[0]}-{p[1]}: ruas paling pelan, {p[2]:.0f} km/jam.", "Median kecepatan unit yang sedang jalan."))
        if l:
            out.append((HIJAU, "Ruas lancar (> 17 km/jam): " + ", ".join(f"STA {a}-{b}" for a, b, _, _ in l) + ".", ""))
    # 4. rit lambat
    lam = rit[rit.durasi > batas_lambat]
    if len(lam):
        s = ", ".join(f"{x.unit.replace('WHL ', '')} ({x.durasi / 60:.1f} jam)" for _, x in lam.sort_values("durasi", ascending=False).iterrows())
        out.append((MERAH, f"{len(lam)} rit muatan lambat (> {batas_lambat / 60:.1f} jam).", s + "."))
    # 5. parkir malam (mesin mati) di badan jalan
    pk = d[~d.acc & ~d.sta.apply(lambda s: bool(ht.zona_bukan_jalan(s)))]
    if len(pk):
        top = pk.groupby("seg").unit.agg(lambda x: sorted(set(x))).loc[lambda s: s.str.len() > 0]
        top = sorted(top.items(), key=lambda kv: -len(pk[pk.seg == kv[0]]))[:2]
        for seg, u in top:
            n = len(pk[pk.seg == seg])
            if n >= 3:
                out.append((ABU, f"STA {seg}-{seg + 1}: unit parkir mesin mati di badan jalan ({n} jam unit).", "Unit: " + ", ".join(x.replace("WHL ", "") for x in u) + "."))
    return out


def halaman_ringkasan(pdf, tgl, g, rit, tem, laporan, trigger, batas_lambat, mulai, akhir):
    fig = plt.figure(figsize=(8.27, 11.69), dpi=150)
    fig.patches.append(plt.Rectangle((0, 0.87), 1, 0.13, transform=fig.transFigure, color=GELAP, zorder=0))
    fig.text(0.06, 0.965, "LAPORAN HARIAN JALAN ALR", fontsize=13, color="#facc15", fontweight="bold", va="top")
    fig.text(0.06, 0.94, tgl_id(tgl), fontsize=24, color="white", fontweight="bold", va="top")
    fig.text(0.06, 0.895, "Kecepatan, titik berhenti & ritase unit WHL  (BSR STA 29  >  107 STA 0)", fontsize=11, color="#e5e7eb", va="top")
    fig.text(0.06, 0.855, f"Periode {mulai:%d/%m %H:%M} - {akhir:%d/%m %H:%M} WIB. Sumber: GPS TrackSolid (per jam), Ritase GPS, laporan lapangan aplikasi ALR. "
             f"Dibuat otomatis {pd.Timestamp.now(tz='Asia/Jakarta'):%d/%m %H:%M}.", fontsize=7.5, color="#555", va="top", wrap=True)
    normal = rit[rit.durasi <= batas_lambat]
    kotak = [(str(g.unit.nunique()), "unit lewat ALR"), (str(len(rit)), "rit muatan"),
             (f"{normal.durasi.median():.0f} mnt" if len(normal) else "-", "median rit normal"),
             (f"{(rit.durasi > batas_lambat).sum()} rit", f"lambat > {batas_lambat / 60:.1f} jam")]
    for i, (v, t) in enumerate(kotak):
        x = 0.06 + i * 0.225; c = MERAH if i == 3 and v != "0 rit" else GELAP
        fig.patches.append(matplotlib.patches.FancyBboxPatch((x, 0.74), 0.2, 0.085, boxstyle="round,pad=0,rounding_size=0.01",
                           transform=fig.transFigure, fc="white", ec=c, lw=2))
        fig.text(x + 0.1, 0.795, v, fontsize=20, fontweight="bold", color=c, ha="center", va="center")
        fig.text(x + 0.1, 0.755, t, fontsize=9, color="#444", ha="center", va="center")
    y = 0.71
    fig.text(0.06, y, "Temuan hari ini", fontsize=15, fontweight="bold", va="top"); y -= 0.04
    import textwrap
    for c, t, s in tem[:7]:
        fig.patches.append(plt.Circle((0.07, y - 0.007), 0.007, transform=fig.transFigure, color=c))
        for ln in textwrap.wrap(t, 80):
            fig.text(0.09, y, ln, fontsize=10.5, fontweight="bold", va="top"); y -= 0.02
        for ln in textwrap.wrap(s, 100):
            fig.text(0.09, y, ln, fontsize=9, color="#444", va="top"); y -= 0.017
        y -= 0.01
    y -= 0.005
    fig.text(0.06, y, f"Trigger jalan dari GPS ({len(trigger)})", fontsize=13, fontweight="bold", va="top"); y -= 0.03
    for t in trigger[:8]:
        u = ", ".join(x.replace("WHL ", "") for x in t.get("unit", [])) or "-"
        fig.text(0.07, y, f"• {t['judul'].replace('[TRIGGER] ', '')}  (unit: {u})", fontsize=9, va="top"); y -= 0.019
    if not trigger:
        fig.text(0.07, y, "• Tidak ada trigger merah.", fontsize=9, va="top"); y -= 0.019
    y -= 0.01
    fig.text(0.06, y, f"Laporan lapangan masuk dari aplikasi ({len(laporan)})", fontsize=13, fontweight="bold", va="top"); y -= 0.03
    for l in laporan[:6]:
        fig.text(0.07, y, f"• {l.get('waktu', '')}  {l.get('judul', '')}  {l.get('tim', '')}", fontsize=9, va="top"); y -= 0.019
    if not laporan:
        fig.text(0.07, y, "• Belum ada laporan lapangan (CH GPE / WHL) di tanggal ini.", fontsize=9, color="#b45309", va="top"); y -= 0.019
    fig.text(0.06, 0.035, "Catatan: GPS 1 titik per jam, posisi STA bisa meleset ±1 km. Hal. 2 = skema STA, Hal. 3 = per 200 m, Hal. 4 = rit per unit.",
             fontsize=7.5, color="#666")
    fig.text(0.94, 0.035, "Hal. 1", fontsize=8, color="#666", ha="right")
    pdf.savefig(fig); return fig


def halaman_peta(pdf, tgl, g, hal):
    """Skema STA berwarna di atas garis jalan (data/jalur_sta.csv): warna per 1 KM = kecepatan unit yang jalan,
    bintang = kotak 200 m yang paling lama dipakai berhenti (di luar zona parkir/antrean)."""
    j = ht.baca_jalur()
    at = lambda s: (float(np.interp(s, j.sta, j.lat)), float(np.interp(s, j.sta, j.lon)))
    fig = plt.figure(figsize=(8.27, 11.69), dpi=150)
    fig.text(0.06, 0.965, f"Skema STA Jalan ALR - {tgl_id(tgl, False)}", fontsize=16, fontweight="bold")
    fig.text(0.06, 0.945, "Warna = kecepatan rata-rata unit WHL yang jalan per 1 KM. Bintang = titik paling lama unit berhenti. STA 0 = 107, STA 29 = BSR.", fontsize=7.5, color="#555")
    ax = fig.add_axes([0.04, 0.2, 0.92, 0.72]); ax.set_aspect("equal"); ax.axis("off")
    ax.plot(j.lon, j.lat, color="#374151", lw=11, solid_capstyle="round", zorder=1)
    km_v = {}
    for k in range(STA_BSR):
        x = g[(g.speed > 3) & (g.sta >= k) & (g.sta < k + 1)]
        v = float(x.speed.mean()) if len(x) else None; km_v[k] = v
        pts = [at(q) for q in np.linspace(k, k + 1, 12)]
        ax.plot([q[1] for q in pts], [q[0] for q in pts], color=wr(v) if v else "#d1d5db", lw=7, solid_capstyle="butt", zorder=2)
    for s_ in range(0, STA_BSR + 1):
        la, lo = at(s_); big = s_ % 5 == 0
        ax.plot(lo, la, "o", ms=7 if big else 3.5, color="#111" if big else "white", mec="#111", mew=0.8, zorder=3)
        ax.text(lo + 0.0025, la + 0.0012, f"STA {s_}" if big else str(s_), fontsize=8 if big else 6, fontweight="bold" if big else "normal", zorder=4)
    d = g[(g.speed <= 3)].copy(); d["c"] = np.floor(d.sta / 0.2 + 1e-9).astype(int)
    d = d[~d.sta.apply(lambda q: bool(ht.zona_bukan_jalan(q)))]
    top = d.groupby("c").agg(n=("unit", "size"), u=("unit", lambda x: sorted(set(x)))).sort_values("n", ascending=False).head(5)
    bintang = []
    for c, x in top.iterrows():
        if x.n < 2: continue
        la, lo = at(c * 0.2 + 0.1)
        ax.plot(lo, la, "*", ms=17, color="#facc15", mec="#111", mew=1, zorder=6)
        lab = f"STA {int(c * 0.2)}+{int(round((c * 0.2 % 1) * 1000)):03d}: {x.n} jam berhenti\nunit " + ", ".join(u.replace("WHL ", "") for u in x.u[:4])
        bintang.append((la, lo, lab))
    xl = j.lon.min() - 0.025; yy = None
    for la, lo, lab in sorted(bintang, reverse=True):  # label ditumpuk rapi di kiri, garis ke bintang
        yy = la if yy is None else min(la, yy - 0.011)
        ax.annotate(lab, (lo, la), xytext=(xl, yy), fontsize=6.5, color=MERAH, fontweight="bold", ha="right", va="center", zorder=7,
                    bbox=dict(fc="white", ec=MERAH, boxstyle="round,pad=0.25"), arrowprops=dict(arrowstyle="-", color=MERAH, lw=0.8))
    for nm, s_ in (("BSR", STA_BSR), ("107", 0)):
        la, lo = at(s_); ax.plot(lo, la, "s", ms=15, color="#111", zorder=5); ax.text(lo, la - 0.006, nm, fontsize=12, fontweight="bold", ha="center", va="top")
    x0, x1 = ax.get_xlim(); y0, y1 = ax.get_ylim(); ax.set_xlim(min(x0, j.lon.min() - 0.075), x1 + 0.02); ax.set_ylim(y0 - 0.01, y1 + 0.01)
    for k, (c, l) in enumerate([(HIJAU, "Lancar (> 17 km/jam)"), (ORANYE, "Agak pelan (14-17)"), (MERAH, "Pelan / jelek (<= 13)"), ("#d1d5db", "Data kurang")]):
        fig.patches.append(plt.Rectangle((0.06 + k * 0.22, 0.17), 0.035, 0.008, transform=fig.transFigure, color=c))
        fig.text(0.1 + k * 0.22, 0.174, l, fontsize=7.5, va="center")
    a2 = fig.add_axes([0.05, 0.06, 0.9, 0.09]); a2.set_xlim(STA_BSR + 1.8, -1.8); a2.set_ylim(-1.6, 1.6); a2.axis("off")
    for k, v in km_v.items():
        a2.plot([k, k + 1], [0, 0], color=wr(v) if v else "#d1d5db", lw=13, solid_capstyle="butt")
        if v: a2.text(k + 0.5, -1.25, f"{v:.0f}", ha="center", fontsize=6, color=wr(v), fontweight="bold")
    for s_ in range(STA_BSR + 1):
        a2.plot([s_, s_], [-0.3, 0.3], color="white", lw=1); a2.text(s_, -0.75, str(s_), ha="center", fontsize=6)
    a2.text(STA_BSR + 1.5, 0, "BSR", ha="left", va="center", fontsize=9, fontweight="bold"); a2.text(-1.5, 0, "107", ha="right", va="center", fontsize=9, fontweight="bold")
    a2.annotate("", xy=(4, 1.1), xytext=(25, 1.1), arrowprops=dict(arrowstyle="-|>", lw=1.5, color=MERAH))
    a2.text(14.5, 1.35, "arah MUATAN (BSR > 107), angka bawah = km/jam", ha="center", fontsize=7, color=MERAH, fontweight="bold")
    fig.text(0.94, 0.025, f"Hal. {hal}", fontsize=8, color="#666", ha="right"); pdf.savefig(fig); return fig


def halaman_sta(pdf, tgl, g, ruas):
    """Pita per 200 m seperti di aplikasi (grafik.js): tiap baris = 1 KM, 5 kotak @200 m.
    Angka besar = jam unit berhenti (mesin hidup + mati), bawah = rata-rata km/jam unit yang jalan."""
    from matplotlib.patches import FancyBboxPatch
    fig = plt.figure(figsize=(8.27, 11.69), dpi=150)
    fig.text(0.06, 0.965, f"Jalan ALR per 200 meter ({tgl_id(tgl, False)})", fontsize=16, fontweight="bold")
    fig.text(0.06, 0.945, "Angka besar = jam unit berhenti di kotak itu (1 titik GPS diam = ±1 jam). Bawah = kecepatan rata-rata unit yang jalan.", fontsize=8, color="#555")
    n = int(round(STA_BSR / 0.2)); seg = np.clip(np.floor(g.sta / 0.2 + 1e-9).astype(int), 0, n - 1) if len(g) else []
    g = g.assign(seg=seg)
    diam = g[g.speed <= 3].groupby("seg").size().reindex(range(n), fill_value=0)
    jalan = g[g.speed > 3].groupby("seg").speed.mean().reindex(range(n))
    zona = [ht.zona_bukan_jalan(i * 0.2 + 0.1) for i in range(n)]
    maks = max(3, max(int(diam[i]) for i in range(n) if not zona[i]))
    WK = {"h": "#3FA34D", "k": "#F2B705", "m": "#E5341F"}; TK = {"h": "white", "k": "#23282A", "m": "white"}
    kelas = lambda j: "m" if j >= maks * 0.6 else "k" if j >= maks * 0.25 else "h"
    ax = fig.add_axes([0.04, 0.07, 0.92, 0.86]); ax.axis("off")
    kol = [(range(STA_BSR - 1, 14, -1), 0.0), (range(14, -1, -1), 0.5)]
    for kms, x0 in kol:
        for r, km in enumerate(kms):
            y = 1 - (r + 1) * (1 / 15.3)
            ax.text(x0 + 0.005, y + 0.028, f"KM\n{km + 1}-{km}", fontsize=7.5, fontweight="bold", va="center", ha="left", transform=ax.transAxes, color="#333")
            for c, i in enumerate(range(km * 5 + 4, km * 5 - 1, -1)):
                bx = x0 + 0.075 + c * 0.081; bw, bh = 0.075, 0.058
                z = zona[i]; j = int(diam[i]); v = jalan[i]
                fc = "#9ca3af" if z else WK[kelas(j)]; tc = "white" if z else TK[kelas(j)]
                ax.add_patch(FancyBboxPatch((bx, y), bw, bh, boxstyle="round,pad=0,rounding_size=0.008", fc=fc, ec="none", transform=ax.transAxes))
                sta = i * 0.2; lab = f"{int(sta)}+{int(round((sta % 1) * 1000)):03d}"
                ax.text(bx + bw / 2, y + bh - 0.009, lab, fontsize=5.8, ha="center", va="top", color=tc, transform=ax.transAxes, fontweight="bold")
                if z:
                    ax.text(bx + bw / 2, y + bh * 0.42, "zona\nparkir", fontsize=5.5, ha="center", va="center", color="white", transform=ax.transAxes); continue
                ax.text(bx + bw / 2, y + bh * 0.47, str(j), fontsize=11, ha="center", va="center", color=tc, transform=ax.transAxes, fontweight="bold")
                ax.text(bx + bw / 2, y + 0.006, f"{v:.0f} km/j" if v == v else "-", fontsize=5.8, ha="center", va="bottom", color=tc, transform=ax.transAxes)
    for k, (c, l) in enumerate([("#3FA34D", "Sedikit berhenti"), ("#F2B705", "Sedang"), ("#E5341F", "Lama berhenti"), ("#9ca3af", "Zona parkir/antrean (tidak dihitung)")]):
        fig.patches.append(plt.Rectangle((0.06 + k * 0.2, 0.045), 0.02, 0.01, transform=fig.transFigure, color=c))
        fig.text(0.085 + k * 0.2, 0.05, l, fontsize=7.5, va="center")
    fig.text(0.06, 0.025, f"Urutan BSR (KM 29, kiri atas) ke 107 (KM 0, kanan bawah). Merah = >= {maks * 0.6:.0f} jam, kuning = >= {maks * 0.25:.0f} jam.", fontsize=7, color="#666")
    fig.text(0.94, 0.025, "Hal. 3", fontsize=8, color="#666", ha="right"); pdf.savefig(fig); return fig


def halaman_rit(pdf, tgl, rit, batas_lambat, mulai, akhir):
    fig = plt.figure(figsize=(8.27, 11.69), dpi=150)
    fig.text(0.06, 0.96, f"Rit muatan BSR > 107 per unit ({tgl_id(tgl, False)})", fontsize=16, fontweight="bold")
    fig.text(0.06, 0.94, "Batang = jam berangkat dari BSR sampai tiba di 107. Hijau = normal, merah = lambat.", fontsize=8.5, color="#555")
    ax = fig.add_axes([0.13, 0.2, 0.82, 0.7])
    units = sorted(rit.unit.unique(), reverse=True); y = {u: i for i, u in enumerate(units)}
    for _, x in rit.iterrows():
        lam = x.durasi > batas_lambat; c = MERAH if lam else HIJAU
        ax.barh(y[x.unit], x.t - x.b, left=x.b, height=0.55, color=c)
        ax.text(x.t + pd.Timedelta(minutes=10), y[x.unit], f"{x.durasi / 60:.1f} jam" if lam else f"{x.durasi:.0f} mnt", va="center", fontsize=7.5, fontweight="bold", color=c)
    ax.axvspan(mulai + pd.Timedelta(hours=12), akhir, color="#f3f4f6", zorder=0)
    ax.set_yticks(range(len(units))); ax.set_yticklabels(units, fontsize=8)
    ax.xaxis.set_major_formatter(md.DateFormatter("%d/%m\n%H:%M")); ax.xaxis.set_major_locator(md.HourLocator(interval=3)); ax.tick_params(axis="x", labelsize=7)
    kanan = max(akhir, rit.t.max() + pd.Timedelta(hours=1)) if len(rit) else akhir
    ax.set_xlim(mulai, kanan); ax.grid(axis="x", color="#e5e7eb"); ax.set_axisbelow(True); ax.spines[["top", "right"]].set_visible(False)
    n = rit[rit.durasi <= batas_lambat]
    if len(rit):
        fig.text(0.06, 0.13, f"Rit normal: {len(n)} rit, median {n.durasi.median():.0f} menit ({n.durasi.min():.0f}-{n.durasi.max():.0f})." if len(n) else "Tidak ada rit normal.", fontsize=10, fontweight="bold")
        fig.text(0.06, 0.105, f"Rit lambat (> {batas_lambat:.0f} menit): {len(rit) - len(n)} rit.  Waktu di lokasi muat (median): {rit.muat.median():.0f} menit.", fontsize=9.5)
    else:
        fig.text(0.06, 0.13, "Tidak ada rit muatan BSR > 107 di tanggal ini.", fontsize=10, fontweight="bold")
    fig.text(0.94, 0.035, "Hal. 4", fontsize=8, color="#666", ha="right"); pdf.savefig(fig); return fig


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tgl", required=True); ap.add_argument("--gps", nargs="*"); ap.add_argument("--rit", default=ht.P("data", "rit", "ritase_gps.csv"))
    ap.add_argument("--laporan"); ap.add_argument("--trigger", default=ht.P("docs", "data", "ringkasan.json")); ap.add_argument("--out", default=ht.P("laporan"))
    a = ap.parse_args()
    tgl = pd.Timestamp(a.tgl); mulai = tgl + pd.Timedelta(hours=6); akhir = mulai + pd.Timedelta(days=1)
    batas = ht.CFG.get("kelayakan", {}).get("rit_lambat_menit", 195)
    jalur = ht.baca_jalur()
    g = baca_gps(a.gps); g = g[(g.waktu >= mulai) & (g.waktu < akhir)]
    g = ht.proyeksi(g, jalur) if len(g) else g.assign(sta=[])
    rit = baca_rit(a.rit); rit = rit[(rit.b >= mulai) & (rit.b < akhir)]
    d, on, off = berhenti(g); ruas = ruas_speed(g)
    laporan = json.load(open(a.laporan)) if a.laporan and os.path.exists(a.laporan) else []
    trigger = []
    if a.trigger and os.path.exists(a.trigger):
        rk = json.load(open(a.trigger))
        if str(rk.get("data_dari", ""))[:10] == a.tgl: trigger = rk.get("trigger", [])
    tem = temuan(g, d, on, off, ruas, rit, batas)
    os.makedirs(a.out, exist_ok=True)
    nama = f"Laporan_Harian_ALR_{tgl.day:02d}{BULAN[tgl.month - 1]}{tgl.year}"
    pdfp = os.path.join(a.out, nama + ".pdf")
    with PdfPages(pdfp) as pdf:
        figs = [halaman_ringkasan(pdf, tgl, g, rit, tem, laporan, trigger, batas, mulai, akhir),
                halaman_peta(pdf, tgl, g, 2), halaman_sta(pdf, tgl, g, ruas), halaman_rit(pdf, tgl, rit, batas, mulai, akhir)]
    for i, f in enumerate(figs, 1):
        f.savefig(os.path.join(a.out, f"{nama}_hal{i}.jpg"), dpi=130, pil_kwargs={"quality": 90})
    print(pdfp, f"{g.unit.nunique()} unit, {len(g)} titik, {len(rit)} rit, {len(tem)} temuan")
    for c, t, s in tem: print(" -", t, "|", s)


if __name__ == "__main__":
    main()
