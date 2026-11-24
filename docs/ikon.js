// Set ikon bersama untuk semua halaman ALR. Dipakai dengan <svg class="ik"><use href="#i-nama"/></svg>
(function () {
  const s = (id, d) => `<symbol id="i-${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</symbol>`;
  const set = [
    s("truk", '<path d="M2 15V9h9l2-3h5l4 5v4"/><path d="M11 9V6H3"/><path d="M2 15h20"/><circle cx="6" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/><path d="M16 6v5h6"/>'),
    s("peta", '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>'),
    s("grafik", '<path d="M3 21h18"/><rect x="5" y="11" width="3" height="7" rx="1"/><rect x="10.5" y="6" width="3" height="12" rx="1"/><rect x="16" y="13" width="3" height="5" rx="1"/>'),
    s("jam", '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    s("telat", '<circle cx="12" cy="13" r="8"/><path d="M12 9v4M12 16.5v.5M5 3 2 6M19 3l3 3"/>'),
    s("speed", '<path d="M4 18a9 9 0 1 1 16 0"/><path d="m12 14 4-5"/><circle cx="12" cy="14" r="1.5"/>'),
    s("rit", '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>'),
    s("lokasi", '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
    s("orang", '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'),
    s("helm", '<path d="M3 17h18"/><path d="M5 17v-3a7 7 0 0 1 14 0v3"/><path d="M10 7.5V11M14 7.5V11"/>'),
    s("awas", '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17v.5"/>'),
    s("kamera", '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    s("nav", '<path d="m3 11 18-8-8 18-2-8-8-2z"/>'),
    s("jalan", '<path d="M8 3 4 21M16 3l4 18"/><path d="M12 4v3M12 11v3M12 18v2"/>'),
    s("kalender", '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    s("info", '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
    s("daftar", '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'),
    s("kanan", '<path d="m9 5 7 7-7 7"/>'),
    s("suara", '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
    s("bisu", '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="m17 9 5 6M22 9l-5 6"/>'),
    s("lonceng", '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
    s("cari", '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
    s("rumah", '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
    s("chat", '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>'),
    s("kotak", '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/>'),
    s("kiri", '<path d="M15 6l-6 6 6 6"/>'), s("naik", '<path d="m6 15 6-6 6 6"/>'), s("turun", '<path d="m6 9 6 6 6-6"/>'),
  ].join("");
  const d = document.createElement("div");
  d.style.display = "none";
  d.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${set}</svg>`;
  document.body.prepend(d);
})();
