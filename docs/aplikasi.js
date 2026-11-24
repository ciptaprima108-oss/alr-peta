// Rasa aplikasi: beranda dengan menu, layar geser, pop-up bawah, suara cewek "ALR ...", dan notifikasi.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const simpan = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
                   set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const koma = (v) => String(v).replace(".", ",");
  const fmtSta = (s) => { let km = Math.floor(s + 1e-9), m = Math.round((s - km) * 1000); if (m === 1000) { km++; m = 0; } return `${km}+${String(m).padStart(3, "0")}`; };

  // ---------- splash ----------
  const splash = $("splash"), mulai = Date.now();
  const tutupSplash = () => { if (!splash) return; setTimeout(() => { splash.classList.add("hilang"); setTimeout(() => splash.remove(), 600); }, Math.max(0, 1100 - (Date.now() - mulai))); };
  window.addEventListener("load", tutupSplash); setTimeout(tutupSplash, 3500);

  // ---------- suara: klik halus + suara cewek bahasa Indonesia ----------
  let suaraNyala = simpan.get("alr_suara", true), getarNyala = simpan.get("alr_getar", true), ctx = null, suaraCewek = null;
  function pilihSuara() {
    const v = speechSynthesis?.getVoices?.() || [];
    const id = v.filter((x) => /^id|ind/i.test(x.lang));
    suaraCewek = id.find((x) => /damayanti|gadis|female|wanita|perempuan/i.test(x.name)) || id.find((x) => /google/i.test(x.name)) || id[0] || null;
  }
  if ("speechSynthesis" in window) { pilihSuara(); speechSynthesis.onvoiceschanged = pilihSuara; }
  function bicara(teks) {
    if (!suaraNyala || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(teks);
    u.lang = "id-ID"; if (suaraCewek) u.voice = suaraCewek; u.rate = 1; u.pitch = 1.15; u.volume = 1;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
  function klik() {
    if (!suaraNyala) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.type = "sine"; o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(990, t + 0.05);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.1);
    } catch {}
    if (getarNyala && navigator.vibrate) navigator.vibrate(8);
  }
  function denting() {           // bunyi "teng-teng" pendek sebelum suara ALR
    if (!suaraNyala) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      [[880, 0], [1320, 0.16]].forEach(([f, d]) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + d;
        o.type = "triangle"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.5);
      });
    } catch {}
    if (getarNyala && navigator.vibrate) navigator.vibrate([60, 60, 60]);
  }
  const umumkan = (teks) => { denting(); setTimeout(() => bicara(teks), 650); };

  // ---------- toast "ALR: ..." di atas layar ----------
  const wadahToast = document.createElement("div"); wadahToast.className = "toast-wadah"; wadahToast.setAttribute("aria-live", "polite"); document.body.appendChild(wadahToast);
  function toast(judul, isi = "", ikon = "lonceng", aksi = null) {
    const t = document.createElement("div"); t.className = "toast";
    t.innerHTML = `<img src="ikon/icon-192.png" alt=""><div><small>ALR · sekarang</small><b>${esc(judul)}</b>${isi ? `<span>${esc(isi)}</span>` : ""}</div>`;
    if (aksi) { t.style.cursor = "pointer"; t.onclick = () => { aksi(); t.remove(); }; }
    wadahToast.appendChild(t); requestAnimationFrame(() => t.classList.add("masuk"));
    setTimeout(() => { t.classList.remove("masuk"); setTimeout(() => t.remove(), 400); }, 5200);
  }
  window.ALR_toast = toast;
  // iPhone: suara baru boleh bunyi setelah ketukan pertama, jadi "buka kunci" suara di ketukan pertama
  document.addEventListener("pointerdown", function bukaKunci() {
    try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); ctx.resume(); } catch {}
    try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } catch {}
    document.removeEventListener("pointerdown", bukaKunci);
  });

  // ---------- layar geser (seperti aplikasi) ----------
  const layar = {}; document.querySelectorAll(".lyr").forEach((l) => layar[l.id.replace("lyr-", "")] = l);
  const filter = document.querySelector("#filterSimpan .filter");
  let aktif = null;
  function buka(nama, dariRiwayat = false) {
    if (nama === "pengguna") { $("btnPengawas").click(); if (!dariRiwayat) history.pushState({ lyr: nama }, "", "#pengguna"); return; }
    const l = layar[nama]; if (!l) return;
    if (aktif && aktif !== l) aktif.hidden = true;
    if (l.dataset.filter && filter) l.querySelector(".lyr-filter").appendChild(filter);
    l.hidden = false; l.scrollTop = 0; document.body.classList.add("ada-lyr");
    requestAnimationFrame(() => requestAnimationFrame(() => l.classList.add("tampil")));
    aktif = l;
    setTimeout(() => window.Chart && Object.values(Chart.instances).forEach((c) => c.resize()), 320);
    if (!dariRiwayat) history.pushState({ lyr: nama }, "", "#" + nama);
  }
  function tutup() {
    const l = aktif; if (!l) return;
    l.classList.remove("tampil"); document.body.classList.remove("ada-lyr"); aktif = null;
    setTimeout(() => { if (!l.classList.contains("tampil")) l.hidden = true; }, 320);
    speechSynthesis?.cancel?.();
  }
  window.ALR_buka = buka;
  document.querySelectorAll("[data-buka]").forEach((b) => b.addEventListener("click", () => { klik(); buka(b.dataset.buka); }));
  document.querySelectorAll("[data-tutup]").forEach((b) => b.addEventListener("click", () => { klik(); history.state?.lyr ? history.back() : tutup(); }));
  window.addEventListener("popstate", () => {
    closeSheet(true);
    const n = (location.hash || "").slice(1);
    if (!$("layarPengawas").hidden && n !== "pengguna") $("tutupPengawas").click();
    if (layar[n]) buka(n, true); else tutup();
  });
  // tombol atas
  $("btnPanel").onclick = () => { klik(); buka("trigger"); };
  $("tutupPengawas").addEventListener("click", () => { if (history.state?.lyr === "pengguna") history.back(); });
  // kartu trigger/laporan diketuk: tutup layar dan tunjukkan di peta
  document.addEventListener("click", (e) => {
    const k = e.target.closest(".lyr .kartu"); if (!k || e.target.closest("a") || !k.dataset.ll) return;
    klik(); history.state?.lyr ? history.back() : tutup(); window.scrollTo({ top: 0, behavior: "smooth" });
  });
  // buka layar langsung dari alamat, misal .../#km
  const awal = (location.hash || "").slice(1);
  if (layar[awal]) { history.replaceState(null, "", location.pathname); setTimeout(() => buka(awal), 400); }

  // ---------- pop-up bawah: ketuk kotak KM ----------
  const sheet = document.createElement("div"); sheet.className = "sheet-latar"; sheet.hidden = true;
  sheet.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetJudul"><div class="sheet-pegangan"></div><div id="sheetIsi"></div></div>`;
  document.body.appendChild(sheet);
  function closeSheet(diam) { if (sheet.hidden) return; sheet.classList.remove("tampil"); setTimeout(() => sheet.hidden = true, 280); if (!diam) klik(); }
  sheet.addEventListener("click", (e) => { if (e.target === sheet || e.target.closest("[data-tutup-sheet]")) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (!sheet.hidden) closeSheet(); else if (aktif) history.state?.lyr ? history.back() : tutup(); } });
  function bukaSheet(html, kata) {
    $("sheetIsi").innerHTML = html; sheet.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add("tampil")));
    klik();
  }
  document.addEventListener("click", (e) => {
    const r = e.target.closest("rect.kotak-km"); if (!r || !window.ALR_KM_DATA) return;
    const km = +r.dataset.km, D = window.ALR_KM_DATA, k = D.km[km], rr = window.ALR_RR?.km?.[km];
    const baris = (nama, t) => { if (!t) return ""; const v = t[km], jam = v[1] + v[2], sp = v[4] ? Math.round(v[3] / v[4]) : null;
      return `<div class="sh-lajur"><b>${nama}</b><div><span class="angka">${jam}</span> jam berhenti<br><small>${v[1]} jam mesin hidup, ${v[2]} jam mesin mati</small></div>
        <div><span class="angka">${sp ?? "-"}</span> km/jam<br><small>${sp ? `kira-kira ${Math.max(1, Math.round(60 / sp))} menit lewat 1 KM` : "belum ada data jalan"}</small></div></div>`; };
    const tengah = k.km + 0.5;
    const html = `<h3 id="sheetJudul">${esc(k.label)}${k.zona ? `<small>${esc(k.zona)}, tidak dihitung sebagai jalan rusak</small>` : ""}</h3>
      ${D.totM ? baris("Jalur muatan, BSR ke 107", D.totM) + baris("Jalur kosongan, 107 ke BSR", D.totK) : baris("Semua arah", D.totSemua)}
      ${rr && rr.rr != null ? `<div class="sh-rr">RR perkiraan <b>${koma(rr.rr)}%</b>, traksi saat basah <b>${{ aman: "aman", waspada: "waspada", rawan: "rawan selip" }[rr.traksi]}</b>${rr.tanjakan_muatan != null ? `, tanjakan arah muatan ${koma(rr.tanjakan_muatan)}%` : ""}.</div>` : ""}
      <div class="sh-aksi"><button type="button" class="utama" id="shPeta"><svg class="ik"><use href="#i-peta"/></svg>Lihat di peta</button>
        <a class="abu" target="_blank" href="#" id="shLapor"><svg class="ik"><use href="#i-kamera"/></svg>Lapor KM ini</a>
        <button type="button" class="abu" data-tutup-sheet>Tutup</button></div>`;
    const v = D.totSemua[km];
    bukaSheet(html, `ALR. ${k.label.replace("-", " sampai ")}. ${v[1] + v[2]} jam DT berhenti.`);
    $("shPeta").onclick = () => { closeSheet(true); history.state?.lyr ? history.back() : tutup(); setTimeout(() => { window.ALR_keSta?.(tengah, 15); window.scrollTo({ top: 0, behavior: "smooth" }); }, 340); };
    const ll = window.ALR_posisiSta?.(tengah);
    if (ll && window.ALR_linkLapor) $("shLapor").href = window.ALR_linkLapor(fmtSta(tengah), ll[0], ll[1]); else $("shLapor").hidden = true;
  });

  // ---------- beranda: isi kartu status & sub-judul menu ----------
  let nTrig = 0, nLap = 0;
  window.addEventListener("alr:status", (e) => {
    const s = e.detail, warna = { LAYAK: "hijau", KURANG: "kuning", TIDAK: "merah" }[s.kode] || "abu";
    $("sapa").className = "sapa sp-" + warna;
    $("sapaJudul").textContent = s.judul; $("sapaTgl").textContent = s.rentang;
    $("sapaIsi").innerHTML = s.kalimat; $("sapaNilai").hidden = false; $("sapaNilai").querySelector("b").textContent = s.nilai;
    $("subGrafik").textContent = `Nilai jalan ${s.nilai} dari 100`;
  });
  window.addEventListener("alr:km", (e) => { const t = e.detail.top; $("subKm").textContent = t.length ? `Paling lama berhenti: ${t.slice(0, 2).map((k) => k.label).join(", ")}` : "Tidak ada KM bermasalah"; });
  window.addEventListener("alr:rr", (e) => { const d = e.detail, n = d.km.filter((k) => k.traksi && k.traksi !== "aman").length; $("subRr").textContent = `RR rata-rata ${koma(d.rr_rata)}%, ${n} KM waspada selip`; });
  const angkaUbin = () => {
    $("ubinTrig").hidden = !nTrig; $("ubinTrig").textContent = nTrig; $("subTrig").textContent = nTrig ? `${nTrig} jalan merah perlu dicek` : "Tidak ada jalan merah";
    $("ubinLap").hidden = !nLap; $("ubinLap").textContent = nLap; $("subLap").textContent = nLap ? `${nLap} laporan belum selesai` : "Foto dan video dari pengawas";
    try { if (navigator.setAppBadge) nTrig ? navigator.setAppBadge(nTrig) : navigator.clearAppBadge(); } catch {}
  };
  // jumlah pengguna dari daftar ID card
  new MutationObserver(() => { const n = document.querySelectorAll("#listPengawas .idc").length; if (n) $("subPengguna").textContent = `${n} orang, ID card per divisi`; }).observe($("listPengawas"), { childList: true, subtree: true });

  // ---------- notifikasi: trigger & laporan baru ----------
  const DILIHAT = "alr_dilihat";
  let dilihat = simpan.get(DILIHAT, null);
  const pertamaKali = dilihat === null;           // null = pertama kali buka: jangan bunyikan yang lama
  function periksa(daftar) {
    const diam = pertamaKali && Date.now() - mulai < 20000;   // pertama kali buka aplikasi: catat saja, jangan bunyi
    const baru = daftar.filter((x) => !diam && dilihat && !dilihat.includes(x.kunci));
    dilihat = [...new Set([...(dilihat || []), ...daftar.map((x) => x.kunci)])].slice(-400); simpan.set(DILIHAT, dilihat);
    if (!baru.length) return;
    const satu = baru[0], judul = baru.length > 1 ? `${baru.length} pemberitahuan baru` : satu.judul;
    toast(judul, baru.length > 1 ? baru.map((x) => x.judul).join(", ") : satu.isi, "lonceng", () => buka(satu.layar));
    umumkan(baru.some((x) => x.layar === "trigger") ? "ALR, ada info jalan" : "ALR, pesan masuk");
    notifHp(judul, baru.length > 1 ? baru.map((x) => x.judul).join(", ") : satu.isi, satu.layar);
  }
  const ucapSta = (s) => `KM ${Math.floor(s)}${Math.round((s % 1) * 10) ? " koma " + Math.round((s % 1) * 10) : ""}`;
  function dariRingkasan(ring) {
    nTrig = Math.max(nTrig, (ring.trigger || []).length); angkaUbin();
    return (ring.trigger || []).map((t) => ({ kunci: `sta-${t.sta_awal}-${t.sta_akhir}`, layar: "trigger",
      judul: `ALR: Jalan merah STA ${fmtSta(t.sta_awal)}`, isi: t.alasan, ucap: `ALR. Ada jalan merah di ${ucapSta(t.sta_awal)}. Mohon dicek.` }));
  }
  function dariTiket(trig, lap) {
    nTrig = trig.filter((i) => i.state === "open").length || nTrig; nLap = lap.filter((i) => i.state === "open").length; angkaUbin();
    return [...trig.filter((i) => i.state === "open").map((i) => ({ kunci: "issue-" + i.number, layar: "trigger", judul: `ALR: Trigger baru #${i.number}`, isi: i.title.replace(/^\[TRIGGER\]\s*/i, ""), ucap: `ALR. Ada trigger baru. ${i.title.replace(/^\[TRIGGER\]\s*/i, "").replace(/STA (\d+)\+(\d)\d\d/g, "KM $1 koma $2").split(":")[0]}.` })),
            ...lap.map((i) => ({ kunci: "issue-" + i.number, layar: "laporan", judul: `ALR: Laporan lapangan baru`, isi: i.title, ucap: "ALR. Ada laporan lapangan baru dari pengawas." }))];
  }
  window.addEventListener("alr:ringkasan", (e) => periksa(dariRingkasan(e.detail)));
  window.addEventListener("alr:tiket", (e) => periksa(dariTiket(e.detail.trig, e.detail.lap)));
  // cek lagi tiap 5 menit selama aplikasi terbuka
  setInterval(async () => {
    if (document.visibilityState !== "visible") return;
    try { const r = await (await fetch("data/ringkasan.json", { cache: "no-store" })).json(); periksa(dariRingkasan(r)); } catch {}
    try {
      const is = (await (await fetch("https://api.github.com/repos/ciptaprima108-oss/alr-peta/issues?state=open&per_page=50")).json()).filter((i) => !i.pull_request);
      const lbl = (i, n) => i.labels.some((l) => l.name === n);
      periksa(dariTiket(is.filter((i) => lbl(i, "trigger")), is.filter((i) => lbl(i, "laporan-jalan"))));
    } catch {}
  }, 5 * 60 * 1000);

  // notifikasi HP (muncul di layar kunci). iPhone: hanya kalau ALR dipasang ke Layar Utama (iOS 16.4 ke atas)
  let sw = null;
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").then((r) => sw = r).catch(() => {});
  const bisaNotif = "Notification" in window;
  const diLayarUtama = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  function notifHp(judul, isi, lyr) {
    if (!bisaNotif || Notification.permission !== "granted" || document.visibilityState === "visible") return;
    const o = { body: isi, icon: "ikon/icon-192.png", badge: "ikon/icon-192.png", tag: "alr-" + judul, data: { url: "./#" + lyr } };
    sw ? sw.showNotification(judul, o) : new Notification(judul, o);
  }
  // ---------- layar profil & pengaturan ----------
  const ios = /iphone|ipad/i.test(navigator.userAgent);
  function aturNotif() {
    const ket = $("pfNotifKet"), btn = $("btnNotif"); let perlu = false;
    if (!bisaNotif) {
      ket.textContent = ios && !diLayarUtama ? "Di iPhone: pencet tombol Bagikan di Safari, pilih Tambah ke Layar Utama, lalu buka ALR dari ikon itu. Setelah itu notifikasi bisa dinyalakan di sini."
        : "HP atau browser ini belum mendukung notifikasi.";
      btn.hidden = true; perlu = ios && !diLayarUtama;
    } else if (Notification.permission === "granted") { ket.textContent = "Nyala. Kamu dapat pemberitahuan ALR saat ada jalan merah atau laporan baru."; btn.hidden = true; }
    else if (Notification.permission === "denied") { ket.textContent = "Diblokir. Buka Pengaturan HP, cari ALR, lalu izinkan Notifikasi."; btn.hidden = true; perlu = true; }
    else { btn.hidden = false; perlu = true; }
    $("profilTitik").hidden = !perlu;
  }
  aturNotif();
  $("btnNotif").onclick = async () => {
    klik();
    const izin = await Notification.requestPermission();
    aturNotif();
    if (izin === "granted") { toast("ALR: Notifikasi dinyalakan", "Kamu akan dapat pemberitahuan kalau ada jalan merah atau laporan baru."); umumkan("ALR, notifikasi nyala"); sw?.showNotification("ALR: Notifikasi aktif", { body: "Contoh pemberitahuan dari ALR.", icon: "ikon/icon-192.png" }); }
  };
  $("swSuara").checked = suaraNyala; $("swGetar").checked = getarNyala;
  $("swSuara").onchange = (e) => { suaraNyala = e.target.checked; simpan.set("alr_suara", suaraNyala); if (suaraNyala) umumkan("ALR, suara nyala"); else speechSynthesis?.cancel(); };
  $("swGetar").onchange = (e) => { getarNyala = e.target.checked; simpan.set("alr_getar", getarNyala); if (getarNyala && navigator.vibrate) navigator.vibrate(30); };
  $("btnCoba").onclick = () => { toast("ALR: Contoh pemberitahuan", "Begini tampilan pemberitahuan kalau ada jalan merah."); umumkan("ALR, ada info jalan"); };
  $("btnProfil").onclick = () => { klik(); buka("profil"); };
  // pilih "saya" dari daftar pengguna, tampilkan ID card di profil
  function isiProfil() {
    const daftar = window.ALR_PENGGUNA || [], saya = simpan.get("alr_saya", ""), sel = $("pfSaya");
    sel.innerHTML = `<option value="">Pilih nama...</option>` + daftar.map((p) => `<option value="${esc(p.id || p.nama)}"${(p.id || p.nama) === saya ? " selected" : ""}>${esc(p.nama)} (${esc(p.divisi)})</option>`).join("");
    $("pfJmlPengguna").textContent = `${daftar.length} orang, ID card per divisi`;
    const p = daftar.find((x) => (x.id || x.nama) === saya);
    if (p && window.ALR_idCard) {
      $("pfKartu").innerHTML = window.ALR_idCard(p).replace(/<div class="idc-aksi">[\s\S]*?<\/div>/, "");
      const ins = (p.nama || "?").trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
      $("profilInisial").textContent = ins; $("btnProfil").classList.add("ada-nama");
    } else {
      $("profilInisial").innerHTML = `<svg class="ik"><use href="#i-orang"/></svg>`; $("btnProfil").classList.remove("ada-nama");
    }
  }
  $("pfSaya").onchange = (e) => { simpan.set("alr_saya", e.target.value); klik(); isiProfil(); };
  window.addEventListener("alr:pengguna", isiProfil);
  window.addEventListener("alr:ringkasan", (e) => { $("pfTentang").textContent = `ALR, jalan hauling BSR ke 107. Data GPS sampai ${e.detail.data_sampai}, ${e.detail.n_unit} unit. Versi ${document.querySelector('meta[name="versi"]')?.content || ""}.`; });

  // ---------- peta layar penuh ----------
  function pasangPenuh() {
    const P = window.ALR_PETA; if (!P) return setTimeout(pasangPenuh, 300);
    const K = L.Control.extend({ options: { position: "topleft" }, onAdd() {
      const b = L.DomUtil.create("button", "tombol-penuh"); b.type = "button"; b.title = "Peta layar penuh";
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`;
      L.DomEvent.disableClickPropagation(b); b.onclick = () => { klik(); document.body.classList.contains("peta-penuh") ? (history.state?.peta ? history.back() : penuh(false)) : penuh(true); };
      return b; } });
    new K().addTo(P.map);
  }
  function penuh(on, dariRiwayat) {
    document.body.classList.toggle("peta-penuh", on);
    const b = document.querySelector(".tombol-penuh");
    if (b) b.innerHTML = on ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`;
    if (on && !dariRiwayat) history.pushState({ peta: 1 }, "", "#peta");
    setTimeout(() => window.ALR_PETA?.map.invalidateSize(), 60);
    setTimeout(() => window.ALR_PETA?.map.invalidateSize(), 400);
  }
  pasangPenuh();
  window.addEventListener("popstate", () => { if (document.body.classList.contains("peta-penuh") && location.hash !== "#peta") penuh(false, true); });
  if (location.hash === "#peta") { history.replaceState(null, "", location.pathname); setTimeout(() => penuh(true), 300); }

  // ---------- ikon menu 3D ----------
  const IKON3D = {
    trigger: ["#FF8A65", "#D32F2F", '<path d="M32 15 50 46a3 3 0 0 1-2.6 4.5H16.6A3 3 0 0 1 14 46z" fill="#fff"/><path d="M32 18.5 47.4 45.3a2 2 0 0 1-1.7 3H18.3a2 2 0 0 1-1.7-3z" fill="#FFE9E3"/><rect x="29.4" y="27" width="5.2" height="12.5" rx="2.6" fill="#D32F2F"/><circle cx="32" cy="44" r="2.8" fill="#D32F2F"/>'],
    km: ["#FFE082", "#F2A900", '<path d="M26 14h12l12 38H14z" fill="#2B3134"/><path d="M26 14h12l1 3H25z" fill="#3D4549"/><path d="M14 52 26 14M50 52 38 14" stroke="#fff" stroke-width="2.4"/><path d="M32 18v5M32 28v6M32 39v8" stroke="#FFD54F" stroke-width="3" stroke-linecap="round"/>'],
    rr: ["#7FE3A0", "#1E8E3E", '<circle cx="32" cy="33" r="17" fill="#263238"/><circle cx="32" cy="33" r="17" fill="none" stroke="#37474F" stroke-width="4" stroke-dasharray="3 3.2"/><circle cx="32" cy="33" r="9" fill="#CFD8DC"/><circle cx="32" cy="33" r="9" fill="none" stroke="#fff" stroke-width="1.5" opacity=".7"/><circle cx="32" cy="33" r="3.2" fill="#607D8B"/><path d="M8 50h48" stroke="#14532D" stroke-width="3" stroke-linecap="round" opacity=".5"/>'],
    hujan: ["#8FD3FF", "#2A78D6", '<path d="M20 38h24a8 8 0 0 0 .8-16 11 11 0 0 0-21.2 2.6A6.8 6.8 0 0 0 20 38z" fill="#fff"/><path d="M22 36h21a6 6 0 0 0 4.4-2" stroke="#D6ECFF" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M24 43l-2.5 6M32 43l-2.5 6M40 43l-2.5 6" stroke="#E3F4FF" stroke-width="3.4" stroke-linecap="round"/>'],
    grafik: ["#A5B4FF", "#4B4FD6", '<rect x="15" y="32" width="9" height="17" rx="2.5" fill="#fff"/><rect x="27.5" y="23" width="9" height="26" rx="2.5" fill="#fff"/><rect x="40" y="28" width="9" height="21" rx="2.5" fill="#fff"/><rect x="15" y="32" width="9" height="5" rx="2.5" fill="#FFB74D"/><rect x="27.5" y="23" width="9" height="5" rx="2.5" fill="#4ADE80"/><rect x="40" y="28" width="9" height="5" rx="2.5" fill="#F87171"/><path d="M14 20 26 15l9 5 13-7" stroke="#FFE082" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'],
    laporan: ["#6EE7F0", "#0E8FA0", '<path d="M14 24a4 4 0 0 1 4-4h6l3-4h10l3 4h6a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z" fill="#fff"/><circle cx="32" cy="34" r="9.5" fill="#0E5E6A"/><circle cx="32" cy="34" r="6" fill="#26C6DA"/><circle cx="29.8" cy="31.8" r="2" fill="#fff" opacity=".85"/><circle cx="44" cy="26" r="2" fill="#FFB74D"/>'],
    pengguna: ["#FFC48A", "#E86A1A", '<rect x="16" y="13" width="32" height="40" rx="5" fill="#fff"/><rect x="27" y="10" width="10" height="6" rx="2" fill="#5D4037"/><circle cx="32" cy="28" r="6.5" fill="#FFB074"/><path d="M21.5 44c1.6-6 5.6-8.5 10.5-8.5S41 38 42.5 44z" fill="#E86A1A"/><rect x="22" y="47" width="20" height="2.6" rx="1.3" fill="#FFD9BD"/>'],
  };
  function ikon3d(nama) {
    const [a, b, isi] = IKON3D[nama], id = "i3d-" + nama;
    return `<svg class="ikon3d" viewBox="0 0 64 64" aria-hidden="true"><defs>
      <linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
      <linearGradient id="${id}-k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <filter id="${id}-s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="2.2" stdDeviation="1.6" flood-color="#000" flood-opacity=".3"/></filter></defs>
      <rect x="2" y="5" width="60" height="57" rx="17" fill="${b}"/><rect x="2" y="5" width="60" height="57" rx="17" fill="#000" opacity=".22"/>
      <rect x="2" y="2" width="60" height="57" rx="17" fill="url(#${id}-g)"/>
      <path d="M2 19A17 17 0 0 1 19 2h26a17 17 0 0 1 17 17v3c-19 7-41 7-60 0z" fill="url(#${id}-k)"/>
      <g filter="url(#${id}-s)">${isi}</g></svg>`;
  }
  document.querySelectorAll(".ubin[data-buka]").forEach((u) => { const n = u.dataset.buka, g = u.querySelector(".u-gb"); if (IKON3D[n] && g) { const badge = g.querySelector(".u-badge"); g.innerHTML = ikon3d(n); if (badge) u.appendChild(badge); } });

  // klik halus untuk tombol-tombol lain
  document.addEventListener("click", (e) => { if (e.target.closest(".chip, .chip-d, details > summary, .appbar button:not(#btnProfil):not(#btnPanel)")) klik(); });
})();
