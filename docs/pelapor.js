// Layar Pelapor: untuk orang lapangan (checker CH GPE / WHL, operator, mandor RM, patroli) yang tidak punya No. ID.
// Hanya 4 tombol besar. Form, kamera, cap foto (No. laporan, jam, GPS, STA, nama), dan antrean offline memakai lapor.js.
// Dibuka dari tombol "Saya pelapor lapangan" di layar masuk, atau link ...alr-peta/?pelapor
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const baca = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const tulis = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const klik = () => window.ALR_klik?.();
  const jam = (t) => new Date(t).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(/\./g, ":");
  const TIM = ["CH GPE", "WHL", "RM", "Patroli", "Logistik", "Lainnya"];
  // RM tidak ikut lapor inspeksi / kejadian: RM hanya mengerjakan setelah laporan disetujui atasan
  const TOMBOL_RM = ["rm", "logistik"];
  const TOMBOL = [
    ["inspeksi", "Jalan rusak", "Lubang, licin, longsor, unit selip", "#D62828", "inspeksi"],
    ["logistik", "Minta material", "Batu, sirtu, solar, gorong-gorong", "#E08A00", "logistik"],
    ["rm", "Pekerjaan RM", "Foto sebelum & sesudah dikerjakan", "#1F8A4C", "rm"],
    ["lainnya", "Hujan / lainnya", "Hujan, banjir, insiden, unit mogok", "#4F6D8F", "hujan"],
  ];

  const el = document.createElement("div");
  el.className = "pelapor"; el.id = "layarPelapor"; el.hidden = true;
  document.body.appendChild(el);

  const saya = () => baca("alr_pelapor", null);
  function pasangNama(p) {
    tulis("alr_lapor_nama", p.nama);
    ["inspeksi", "logistik", "lainnya"].forEach((j) => tulis("alr_lapor_tim_" + j, p.tim));
  }

  function gambarIsi() {
    const p = saya();
    if (!p) return gambarDaftar();
    const riwayat = baca("alr_lapor_saya", []).slice(0, 5), antre = baca("alr_antrean", []).length, rm = p.tim === "RM";
    const tugas = rm ? tugasRm() : [];
    el.innerHTML = `<div class="pl-atas"><img src="ikon/logo_alr.png" alt="ALR"><div><b>Lapor Lapangan ALR</b><span>Halo, ${esc(p.nama)} (${esc(p.tim)})</span></div>
        <button type="button" class="pl-ganti" id="plGanti">Ganti</button></div>
      <div class="pl-badan">
        ${rm ? `<h3 class="pl-sub">Tugas untuk RM ${tugas.length ? `<b class="pl-jml">${tugas.length}</b>` : ""}</h3>${tugas.length ? `<div class="pl-tugas">${tugas.map((t) => `<div><b>${esc(t.judul)}</b><span>${esc(t.isi)}</span><small>Ditugaskan ${esc(t.oleh)}, ${jam(t.waktu)}</small>
            <button type="button" class="pl-kerja" data-kerja="${t.nomor}" data-sta="${t.sta ?? ""}">🛠️ Lapor pekerjaan</button></div>`).join("")}</div>` : `<div class="pl-info"><span>✅</span><p>Belum ada tugas dari atasan. Tugas muncul di sini setelah laporan disetujui dan ditugaskan ke RM.</p></div>`}` : ""}
        <p class="pl-tanya">${rm ? "Lapor lainnya" : "Mau lapor apa?"}</p>
        <div class="pl-tombol">${TOMBOL.filter(([j]) => !rm || TOMBOL_RM.includes(j)).map(([j, t, k, w, ik]) => `<button type="button" class="pl-b" style="--w:${w}" data-pl="${j}"><span class="pl-gb">${window.ALR_ikon3d?.(ik) || ""}</span><span><b>${t}</b><small>${k}</small></span></button>`).join("")}</div>
        <div class="pl-info"><span>📷</span><p>Foto langsung dari kamera. <b>No. laporan, jam, tanggal, lokasi GPS, dan STA</b> dicap otomatis di foto.</p></div>
        ${antre ? `<div class="pl-info kuning"><span>📶</span><p><b>${antre} laporan masih di HP.</b> Terkirim otomatis begitu ada sinyal.</p></div>` : ""}
        ${riwayat.length ? `<h3 class="pl-sub">Laporan saya</h3><div class="pl-riwayat">${riwayat.map((r) => `<div><b>${esc(r.no || "-")}</b><span>${esc(String(r.judul || "").replace(/^\[[A-Z ]+\]\s*/, ""))}</span><small>${jam(r.waktu)} · ${r.status === "di HP" ? "menunggu sinyal" : "terkirim"}</small></div>`).join("")}</div>` : ""}
        <button type="button" class="pl-masuk" id="plMasuk">Masuk sebagai pengguna ALR (No. ID + PIN)</button>
      </div>`;
  }
  function gambarDaftar() {
    const p = saya() || {};
    el.innerHTML = `<div class="pl-atas"><img src="ikon/logo_alr.png" alt="ALR"><div><b>Lapor Lapangan ALR</b><span>Isi sekali saja, tersimpan di HP ini</span></div></div>
      <form class="pl-badan" id="plForm" novalidate>
        <label class="pl-lbl">Nama kamu<input id="plNama" class="pl-input" autocomplete="name" placeholder="contoh: Andi" value="${esc(p.nama || "")}"></label>
        <div class="pl-lbl">Tim kamu</div>
        <div class="pl-tim">${TIM.map((t) => `<button type="button" data-tim="${t}" class="${(p.tim || "") === t || (t === "Lainnya" && p.tim && !TIM.includes(p.tim)) ? "aktif" : ""}">${t}</button>`).join("")}</div>
        <input id="plTimLain" class="pl-input" placeholder="Tulis nama tim" value="${esc(p.tim && !TIM.includes(p.tim) ? p.tim : "")}" ${p.tim && !TIM.includes(p.tim) ? "" : "hidden"}>
        <p class="pl-salah" id="plSalah"></p>
        <button type="submit" class="pl-simpan">Simpan & mulai lapor</button>
        <button type="button" class="pl-masuk" id="plMasuk">Masuk sebagai pengguna ALR (No. ID + PIN)</button>
      </form>`;
    setTimeout(() => !p.nama && $("plNama")?.focus(), 80);
  }

  el.addEventListener("click", (e) => {
    const kr = e.target.closest("[data-kerja]");
    if (kr) { klik(); window.ALR_lapor?.("rm", { trigger: kr.dataset.kerja, sta: kr.dataset.sta }); return; }
    const b = e.target.closest("[data-pl]");
    if (b) { klik(); window.ALR_lapor?.(b.dataset.pl); return; }
    const t = e.target.closest("[data-tim]");
    if (t) { klik(); el.querySelectorAll("[data-tim]").forEach((x) => x.classList.toggle("aktif", x === t)); $("plTimLain").hidden = t.dataset.tim !== "Lainnya"; return; }
    if (e.target.closest("#plGanti")) { klik(); gambarDaftar(); return; }
    if (e.target.closest("#plMasuk")) { klik(); el.hidden = true; window.ALR_keluarPelapor?.(); }
  });
  el.addEventListener("submit", (e) => {
    e.preventDefault();
    const nama = $("plNama").value.trim(), pilih = el.querySelector("[data-tim].aktif")?.dataset.tim;
    const tim = pilih === "Lainnya" ? $("plTimLain").value.trim() : pilih;
    if (nama.length < 2) { $("plSalah").textContent = "Isi nama kamu dulu."; return $("plNama").focus(); }
    if (!tim) { $("plSalah").textContent = "Pilih tim kamu."; return; }
    klik(); const p = { nama, tim }; tulis("alr_pelapor", p); pasangNama(p); gambarIsi();
  });

  // tugas RM = trigger / laporan yang masih buka dan keputusan terakhirnya "Tugaskan RM"
  let TIK = [];
  function tugasRm() {
    return TIK.filter((i) => i.state === "open").map((i) => ({ i, k: window.ALR_kepTerakhir?.(i) })).filter((x) => x.k?.aksi === "rm").map(({ i, k }) => {
      const d = i._d || {};
      return { nomor: i.number, sta: d.sta ?? i._lok?.sta, oleh: k.oleh, waktu: k.waktu,
        judul: (i._lok?.label || (d.sta != null ? "STA " + (window.ALR_fmtSta ? window.ALR_fmtSta(d.sta) : d.sta) : "")) || "#" + i.number,
        isi: (d.kendala || d.kategori || []).join(", ") || i.title.replace(/^\[[A-Z ]+\]\s*/, "") };
    }).sort((a, b) => new Date(b.waktu) - new Date(a.waktu));
  }
  window.addEventListener("alr:tiket", (e) => { TIK = [...(e.detail.trig || []), ...(e.detail.lap || [])]; if (!el.hidden && saya()?.tim === "RM") gambarIsi(); });

  function tampil() {
    if (!document.body.classList.contains("mode-pelapor")) { el.hidden = true; return; }
    const p = saya(); if (p) pasangNama(p);
    gambarIsi(); el.hidden = false;
  }
  window.addEventListener("alr:pelapor", tampil);
  window.addEventListener("alr:lapor-saya", () => !el.hidden && saya() && gambarIsi());
  window.addEventListener("alr:layar", (e) => { if (!e.detail.aktif && !el.hidden && saya()) gambarIsi(); });
  tampil();
})();
