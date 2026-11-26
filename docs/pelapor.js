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
    const peran = rm ? "rm" : p.tim === "Logistik" ? "logistik" : "inspeksi";
    el.innerHTML = `<div class="pl-atas"><img src="ikon/logo_alr.png" alt="ALR"><div><b>Lapor Lapangan ALR</b><span>Halo, ${esc(p.nama)} (${esc(p.tim)})</span></div>
        <button type="button" class="pl-ganti" id="plGanti">Ganti</button></div>
      <div class="pl-badan">
        ${bagianAlur(peran)}
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
    const mt = e.target.closest("[data-minta]");
    if (mt) { klik(); window.ALR_lapor?.("logistik", { trigger: mt.dataset.minta, sta: mt.dataset.sta }); return; }
    const kc = e.target.closest("[data-cek]");
    if (kc) { klik(); window.ALR_lapor?.("inspeksi", { trigger: kc.dataset.cek, sta: kc.dataset.sta }); return; }
    const ki = e.target.closest("[data-kirim]");
    if (ki) { klik(); window.ALR_lapor?.("logistik", { permintaan: ki.dataset.kirim, status: "Dikirim" }); return; }
    const vl = e.target.closest("[data-valid]");
    if (vl) { klik(); kirimValidasi(+vl.dataset.valid, "valid", "", vl); return; }
    const ul = e.target.closest("[data-ulang]");
    if (ul) { klik(); const k = ul.closest(".pl-temuan"); let f = k.querySelector(".pl-ulang-isi");
      if (!f) { f = document.createElement("div"); f.className = "pl-ulang-isi"; f.innerHTML = `<textarea class="pl-input" rows="2" placeholder="Apa yang belum beres? contoh: masih ada lubang di sisi kiri"></textarea><button type="button" class="pl-ta merah" data-ulang-kirim="${ul.dataset.ulang}">Kirim, kembalikan ke RM</button>`; k.appendChild(f); }
      f.hidden = false; f.querySelector("textarea").focus(); return; }
    const uk = e.target.closest("[data-ulang-kirim]");
    if (uk) { klik(); const c = uk.parentNode.querySelector("textarea").value.trim(); if (!c) { uk.parentNode.querySelector("textarea").focus(); return; }
      uk.parentNode.hidden = true; kirimValidasi(+uk.dataset.ulangKirim, "ulang", c, uk); return; }
    const lf = e.target.closest("[data-lihat-foto]");
    if (lf) { klik(); const v = document.createElement("div"); v.className = "lp-penampil"; v.innerHTML = `<img src="${esc(lf.dataset.lihatFoto)}" alt="Foto"><button type="button" aria-label="Tutup">×</button>`;
      v.onclick = () => { v.classList.remove("tampil"); setTimeout(() => v.remove(), 250); }; document.body.appendChild(v); requestAnimationFrame(() => v.classList.add("tampil")); return; }
    const b = e.target.closest("[data-pl]");
    if (b) { klik(); window.ALR_lapor?.(b.dataset.pl); return; }
    const t = e.target.closest("[data-tim]");
    if (t) { klik(); el.querySelectorAll("[data-tim]").forEach((x) => x.classList.toggle("aktif", x === t)); $("plTimLain").hidden = t.dataset.tim !== "Lainnya"; return; }
    if (e.target.closest("#plGanti")) { klik(); gambarDaftar(); return; }
    if (e.target.closest("#plMasuk")) { klik(); el.hidden = true; window.ALR_keluarPelapor?.(); }
  });
  async function kirimValidasi(nomor, hasil, catatan, tombol) {
    const p = saya(); tombol.disabled = true;
    const ok = await window.ALR_alur.validasi(nomor, hasil, catatan, { nama: p.nama, tim: p.tim }).catch(() => false);
    window.ALR_toast?.(hasil === "valid" ? "ALR: Temuan divalidasi" : "ALR: Dikembalikan ke RM", ok ? `#${nomor} terkirim.` : `#${nomor} disimpan di HP, terkirim begitu ada sinyal.`);
    gambarIsi();
  }
  el.addEventListener("submit", (e) => {
    e.preventDefault();
    const nama = $("plNama").value.trim(), pilih = el.querySelector("[data-tim].aktif")?.dataset.tim;
    const tim = pilih === "Lainnya" ? $("plTimLain").value.trim() : pilih;
    if (nama.length < 2) { $("plSalah").textContent = "Isi nama kamu dulu."; return $("plNama").focus(); }
    if (!tim) { $("plSalah").textContent = "Pilih tim kamu."; return; }
    klik(); const p = { nama, tim }; tulis("alr_pelapor", p); pasangNama(p); gambarIsi();
  });

  // ---------- alur temuan: tugas sesuai tim (lihat alur.js) ----------
  const A = () => window.ALR_alur;
  const URUT_RM = { dikirim: 0, ulang: 1, rm: 2, diterima: 3, kerja: 4, minta: 5 };
  const chip = (s) => { const x = A()?.TAHAP[s]; return x ? `<span class="pl-tahap t-${x.w}">${esc(x.t)}</span>` : ""; };
  function kartuTemuan(t, tombol) {
    return `<div class="pl-temuan" data-n="${t.nomor}">
      <div class="pl-t-isi">${t.foto ? `<button type="button" class="pl-t-foto" data-lihat-foto="${esc(t.foto)}"><img src="${esc(t.foto)}" loading="lazy" alt="Foto" onerror="this.parentNode.remove()"></button>` : `<span class="pl-t-foto kosong">${t.trig ? "🚨" : "📷"}</span>`}
        <div>${chip(t.s)}<b>${esc(t.judul)}</b><span>${esc(t.isi)}${t.tingkat ? " · " + esc(t.tingkat) : ""}</span>
        <small>${t.pelapor ? esc(t.pelapor) + ", " : ""}${jam(t.waktu)} · #${t.nomor}${t.x?.oleh || t.x?.pelapor ? ` · terakhir: ${esc(t.x.oleh || t.x.pelapor)}` : ""}${t.x?.proses ? " · sedang dikirim" : ""}</small>
        ${t.s === "ulang" && t.x?.catatan ? `<em>Catatan inspeksi: ${esc(t.x.catatan)}</em>` : ""}</div></div>
      ${tombol ? `<div class="pl-t-aksi">${tombol}</div>` : ""}</div>`;
  }
  const tb = (kelas, data, teks) => `<button type="button" class="pl-ta ${kelas}" ${data}>${teks}</button>`;
  function bagianAlur(peran) {
    if (!A()) return "";
    const semua = A().temuan(), judul = (t, n) => `<h3 class="pl-sub">${t}${n ? ` <b class="pl-jml">${n}</b>` : ""}</h3>`;
    const kosong = (t) => `<div class="pl-info"><span>✅</span><p>${t}</p></div>`;
    if (peran === "rm") {
      const tugas = semua.filter((t) => t.s in URUT_RM).sort((a, b) => URUT_RM[a.s] - URUT_RM[b.s] || new Date(b.waktu) - new Date(a.waktu));
      return judul("Tugas RM", tugas.filter((t) => t.s !== "minta").length) + (tugas.length ? `<div class="pl-tugas2">${tugas.map((t) => kartuTemuan(t,
        tb("hijau", `data-kerja="${t.nomor}" data-sta="${t.sta ?? ""}"`, "🛠️ Lapor kerja / selesai") + (t.s === "minta" ? "" : tb("kuning", `data-minta="${t.nomor}" data-sta="${t.sta ?? ""}"`, "📦 Minta material")))).join("")}</div>`
        : kosong("Belum ada temuan dari tim inspeksi. Temuan baru langsung muncul di sini."));
    }
    if (peran === "logistik") {
      const minta = A().permintaan();
      return judul("Permintaan material", minta.length) + (minta.length ? `<div class="pl-tugas2">${minta.map(({ nomor, d, i }) => `<div class="pl-temuan" data-n="${nomor}">
          <div class="pl-t-isi"><span class="pl-t-foto kosong">📦</span><div><span class="pl-tahap t-kuning">Diminta${d.kapan ? ", " + esc(d.kapan.toLowerCase()) : ""}</span>
          <b>${esc(String(d.jumlah ?? "").replace(".", ","))} ${esc(d.satuan || "")} ${esc(d.barang || "")}</b><span>${d.sta != null ? "Ke STA " + esc(window.ALR_fmtSta ? window.ALR_fmtSta(d.sta) : d.sta) : ""}${d.catatan ? ". " + esc(d.catatan) : ""}</span>
          <small>${esc(d.pelapor || "")}${d.tim ? " (" + esc(d.tim) + ")" : ""}, ${jam(d.waktu || i.created_at)} · #${nomor}</small></div></div>
          <div class="pl-t-aksi">${tb("biru", `data-kirim="${nomor}"`, "🚚 Jawab: barang dikirim")}</div></div>`).join("")}</div>`
        : kosong("Tidak ada permintaan material yang menunggu."));
    }
    const val = semua.filter((t) => t.s === "validasi"), cek = semua.filter((t) => t.s === "cek"), jalan = semua.filter((t) => t.s !== "validasi" && t.s !== "cek");
    return judul("Perlu validasi", val.length) + (val.length ? `<div class="pl-tugas2">${val.map((t) => kartuTemuan(t,
        tb("hijau", `data-valid="${t.nomor}"`, "✅ Valid, sudah beres") + tb("merah", `data-ulang="${t.nomor}"`, "↩️ Belum beres"))).join("")}</div>` : kosong("Belum ada pekerjaan RM yang perlu divalidasi.")) +
      (cek.length ? `<details class="pl-jalan"><summary>🚨 Trigger GPS perlu dicek (${cek.length})</summary><div class="pl-tugas2">${cek.map((t) => kartuTemuan(t, tb("merah", `data-cek="${t.nomor}" data-sta="${t.sta ?? ""}"`, "🔍 Cek & lapor"))).join("")}</div></details>` : "") +
      (jalan.length ? `<details class="pl-jalan"><summary>Temuan sedang diproses (${jalan.length})</summary><div class="pl-tugas2">${jalan.map((t) => kartuTemuan(t, "")).join("")}</div></details>` : "");
  }

  // pemberitahuan: bunyi + toast kalau ada tugas baru untuk tim saya
  function kunciTugas(peran) {
    if (!A()) return [];
    if (peran === "logistik") return A().permintaan().map((p) => "p" + p.nomor);
    const ku = A().temuan().filter((t) => (peran === "rm" ? A().TAHAP[t.s]?.siapa === "rm" : t.s === "validasi"));
    return ku.map((t) => t.nomor + ":" + t.s);
  }
  function cekBaru() {
    const p = saya(); if (!p || el.hidden) return;
    const peran = p.tim === "RM" ? "rm" : p.tim === "Logistik" ? "logistik" : "inspeksi";
    const k = kunciTugas(peran), lama = baca("alr_alur_lihat", null), baru = lama ? k.filter((x) => !lama.includes(x)) : [];
    tulis("alr_alur_lihat", k);
    if (!baru.length) return;
    const teks = { rm: "Ada tugas baru untuk RM", logistik: "Ada permintaan material", inspeksi: "Ada pekerjaan RM yang perlu divalidasi" }[peran];
    window.ALR_toast?.(`ALR: ${teks}`, `${baru.length} baru`); window.ALR_umumkan?.(`ALR, ${teks.toLowerCase()}`);
  }
  window.addEventListener("alr:alur", () => { if (!el.hidden && saya() && !el.querySelector(".pl-ulang-isi:not([hidden])")) { gambarIsi(); cekBaru(); } });

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
