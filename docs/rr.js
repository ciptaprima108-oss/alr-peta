// Rolling resistance & traksi per KM (perkiraan) - data dari docs/data/rr_traksi.json
(function () {
  const $ = (id) => document.getElementById(id);
  const WK = { baik: "#3FA34D", sedang: "#F2B705", berat: "#E5341F", aman: "#3FA34D", waspada: "#F2B705", rawan: "#E5341F" };
  const TK = { baik: "#fff", sedang: "#23282A", berat: "#fff", aman: "#fff", waspada: "#23282A", rawan: "#fff" };
  const NAMA_T = { aman: "aman", waspada: "waspada saat basah", rawan: "rawan selip saat basah" };
  const NAMA_R = { baik: "ringan", sedang: "sedang", berat: "berat" };
  const koma = (v) => String(v).replace(".", ",");
  let D = null;

  // dipanggil juga dari grafik.js setelah kartu KM dibuat
  window.isiRR = function () {
    if (!D) return;
    document.querySelectorAll("#topKm .it[data-km]").forEach((el) => {
      const r = D.km[+el.dataset.km], s = el.querySelector(".rr-isi");
      if (!r || !s || r.rr == null) return;
      s.innerHTML = `<br>RR perkiraan <b>${koma(r.rr)}%</b> (${NAMA_R[r.rr_kelas]}), traksi <b>${NAMA_T[r.traksi]}</b>.`;
    });
  };

  function gambar() {
    const urut = [...D.km].reverse();                       // BSR di kiri, 107 di kanan, sama dengan pita jam tertahan
    const n = urut.length, x0 = 50, x1 = 950, w = (x1 - x0) / n, h = 34;
    const yP = 40, hP = 70, yR = yP + hP + 34, yT = yR + h + 30;
    let g = `<defs><pattern id="arsir2" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#454B4D"/><line x1="0" y1="0" x2="0" y2="7" stroke="#7A8183" stroke-width="2.5"/></pattern></defs>`;
    // profil ketinggian
    const ev = urut.map((k) => k.elev).filter((v) => v != null);
    if (ev.length) {
      const lo = Math.min(...ev), hi = Math.max(...ev), sk = (v) => yP + hP - (v - lo) / Math.max(hi - lo, 1) * hP;
      const pts = urut.map((k, i) => k.elev == null ? null : [x0 + i * w + w / 2, sk(k.elev)]).filter(Boolean);
      g += `<path d="M${pts[0][0]},${yP + hP} ${pts.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")} L${pts[pts.length - 1][0]},${yP + hP}Z" fill="#3a4245"/>`;
      g += `<path d="M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L")}" fill="none" stroke="#C3C9C3" stroke-width="2.5"/>`;
      g += `<text x="${x0}" y="${yP - 12}" font-size="17" font-weight="700" fill="#fff">TINGGI JALAN</text><text x="${x0 + 135}" y="${yP - 12}" font-size="15" fill="#C3C9C3">${Math.round(lo)} sampai ${Math.round(hi)} m di atas laut</text>`;
    } else {
      g += `<text x="${x0}" y="${yP + 30}" font-size="16" fill="#C3C9C3">Data tinggi jalan belum ada, tanjakan dianggap datar.</text>`;
    }
    g += `<text x="${x0}" y="${yR - 10}" font-size="17" font-weight="700" fill="#fff">RR (%)</text><text x="${x0 + 70}" y="${yR - 10}" font-size="15" fill="#C3C9C3">makin besar makin berat</text>`;
    g += `<text x="${x0}" y="${yT - 10}" font-size="17" font-weight="700" fill="#fff">TRAKSI SAAT BASAH</text>`;
    urut.forEach((k, i) => {
      const x = x0 + i * w;
      const tip = k.zona ? `${k.label}: ${k.zona} (tidak dihitung)` : k.rr == null ? `${k.label}: data DT muatan belum cukup` :
        `${k.label}: RR ${koma(k.rr)}% (${NAMA_R[k.rr_kelas]}), tanjakan arah muatan ${k.tanjakan_muatan == null ? "-" : koma(k.tanjakan_muatan) + "%"}, kecepatan DT muatan ${koma(k.speed_muatan)} km/jam, traksi ${NAMA_T[k.traksi]}`;
      const isi = (y, kelas, teks) => {
        g += `<rect x="${x + 1.5}" y="${y}" width="${w - 3}" height="${h}" rx="3" fill="${k.zona ? "url(#arsir2)" : kelas ? WK[kelas] : "#3a4245"}"><title>${tip}</title></rect>`;
        if (teks) g += `<text x="${x + w / 2}" y="${y + h / 2 + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="${TK[kelas]}" pointer-events="none">${teks}</text>`;
      };
      isi(yR, k.rr_kelas, k.rr != null ? (k.rr >= 10 ? Math.round(k.rr) : koma(k.rr)) : "");
      isi(yT, k.traksi, k.traksi === "rawan" ? "!" : "");
      const sta = k.km + 1;
      if (sta % 5 === 0 || i === 0) g += `<text x="${x}" y="${yT + h + 22}" text-anchor="middle" font-size="14" fill="#D7DCD5">STA ${sta}</text><line x1="${x}" y1="${yT + h + 3}" x2="${x}" y2="${yT + h + 8}" stroke="#B8BFB7" stroke-width="1.5"/>`;
    });
    g += `<text x="${x1}" y="${yT + h + 22}" text-anchor="middle" font-size="14" fill="#D7DCD5">STA 0</text>`;
    g += `<text x="${x0 - 8}" y="${yR + 23}" text-anchor="end" font-size="20" font-weight="700" fill="#F2B705">BSR</text><text x="${x1 + 8}" y="${yR + 23}" font-size="20" font-weight="700" fill="#F2B705">107</text>`;
    $("rrStrip").setAttribute("viewBox", `0 0 1000 ${yT + h + 30}`);
    $("rrStrip").innerHTML = g;

    // kotak ringkas
    const ok = D.km.filter((k) => k.rr != null);
    const berat = [...ok].sort((a, b) => b.rr - a.rr).slice(0, 3);
    const rawan = ok.filter((k) => k.traksi !== "aman").sort((a, b) => b.mu_perlu - a.mu_perlu);
    const kls = D.rr_rata <= D.asumsi.rr_baik ? "baik" : D.rr_rata <= D.asumsi.rr_berat ? "sedang" : "berat";
    $("rrTiles").innerHTML = `
      <div class="rt"><span class="rt-l">RR rata-rata jalan ALR</span><b style="color:${WK[kls]}">${koma(D.rr_rata)}%</b><span>${NAMA_R[kls]}. Jalan hauling yang terawat biasanya 2 sampai 4%.</span></div>
      <div class="rt"><span class="rt-l">KM paling berat</span><b>${berat.map((k) => k.label.replace("KM ", "")).join(", ")}</b><span>${berat.map((k) => `KM ${k.km}-${k.km + 1}: ${koma(k.rr)}%`).join("<br>")}</span></div>
      <div class="rt"><span class="rt-l">Waspada selip saat hujan</span><b>${rawan.length} KM</b><span>${rawan.length ? "KM " + rawan.map((k) => k.label.replace("KM ", "")).join(", ") + (rawan.some((k) => k.traksi === "rawan") ? ". Yang merah paling rawan." : ". Hati-hati saat hujan.") : "Tidak ada KM yang menonjol."}</span></div>`;

    const A = D.asumsi;
    $("rrCara").innerHTML = `<ol>
      <li><b>Tanjakan</b> tiap KM diambil dari peta ketinggian satelit (ketelitian kasar, kira-kira 90 m). ${D.ada_elevasi ? "" : "<b>Belum tersedia</b>, jadi jalan dianggap datar. "}Kalau ada hasil survei, angkanya bisa diganti.</li>
      <li><b>RR</b> dihitung dari kecepatan DT bermuatan saat jalan lancar di KM itu. DT dengan tenaga penuh makin pelan kalau jalan makin berat. Rumusnya: RR + tanjakan = daya efektif / (berat DT x gravitasi x kecepatan).</li>
      <li><b>Traksi</b>: cengkeraman ban yang dibutuhkan = (RR + tanjakan) / bagian berat di roda penggerak. Jalan tanah basah kira-kira hanya punya cengkeraman ${koma(A.mu_basah)}, kering ${koma(A.mu_kering)}. Kalau kebutuhan mendekati ${koma(A.mu_basah)}, DT bisa selip saat hujan.</li>
      <li><b>Angka DT yang dipakai</b>: daya mesin ${A.daya_kw} kW (sekitar ${Math.round(A.daya_kw * 1.36)} PS), efisiensi ${Math.round(A.efisiensi * 100)}%, berat DT bermuatan ${A.berat_isi_ton} ton, roda penggerak menanggung ${Math.round(A.porsi_roda_penggerak_isi * 100)}% berat saat bermuatan dan ${Math.round(A.porsi_roda_penggerak_kosong * 100)}% saat kosong. Kalau spesifikasi DT berbeda, angka bisa disesuaikan.</li>
      <li>Batas warna RR: hijau sampai ${A.rr_baik}%, kuning sampai ${A.rr_berat}%, merah di atasnya. Data GPS ${D.periode[0]} sampai ${D.periode[1]}. Zona antre, parkir, dan stockpile tidak dihitung.</li></ol>
      <p>KM yang lambat karena batas kecepatan, rambu, atau papasan juga akan terlihat lebih berat dari aslinya. Pakai ini sebagai petunjuk KM mana yang perlu dicek di lapangan.</p>`;
    window.isiRR();
  }

  fetch("data/rr_traksi.json", { cache: "no-cache" }).then((r) => r.ok ? r.json() : null).then((d) => {
    if (!d) { const s = $("rr"); if (s) s.hidden = true; return; }
    D = d; gambar();
  }).catch(() => { const s = $("rr"); if (s) s.hidden = true; });
})();
