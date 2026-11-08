// 다이어그램 공통 아이콘 (직접 그린 선 아이콘, viewBox 0 0 48 48, stroke = currentColor)
// 사용: <svg class="ic" width="48" height="48"><use href="#i-phone"/></svg>
//       SVG 안에서는 <use href="#i-phone" x y width height color="#..."/>
const ICONS = {
  phone: `<rect x="13" y="4" width="22" height="40" rx="4"/><path d="M21 9h6"/><circle cx="24" cy="38" r="1.6" fill="currentColor"/>`,
  laptop: `<rect x="9" y="9" width="30" height="21" rx="2"/><path d="M4 35h40l-3 5H7z"/>`,
  server: `<rect x="8" y="5" width="32" height="13" rx="2"/><rect x="8" y="22" width="32" height="13" rx="2"/><circle cx="14" cy="11.5" r="1.6" fill="currentColor"/><circle cx="14" cy="28.5" r="1.6" fill="currentColor"/><path d="M22 11.5h12M22 28.5h12M24 35v5M14 43h20"/>`,
  router: `<rect x="5" y="22" width="38" height="15" rx="3"/><path d="M14 22l-5-13M34 22l5-13"/><circle cx="12" cy="29.5" r="1.6" fill="currentColor"/><circle cx="18" cy="29.5" r="1.6" fill="currentColor"/><path d="M26 29.5h11"/>`,
  globe: `<circle cx="24" cy="24" r="18"/><ellipse cx="24" cy="24" rx="8" ry="18"/><path d="M6 24h36M9 14h30M9 34h30"/>`,
  tunnel: `<path d="M5 41V25a19 19 0 0 1 38 0v16"/><path d="M14 41V27a10 10 0 0 1 20 0v14"/><path d="M3 41h42"/>`,
  target: `<circle cx="24" cy="24" r="15"/><circle cx="24" cy="24" r="6"/><path d="M24 3v8M24 37v8M3 24h8M37 24h8"/>`,
  relay: `<rect x="17" y="13" width="14" height="22" rx="3"/><path d="M3 24h11M34 24h11"/><path d="M10 20l4 4-4 4M41 20l4 4-4 4"/>`,
  camera: `<rect x="4" y="13" width="28" height="22" rx="4"/><path d="M32 21l12-7v20l-12-7z"/>`,
  mic: `<rect x="18" y="4" width="12" height="22" rx="6"/><path d="M11 21a13 13 0 0 0 26 0M24 34v8M17 43h14"/>`,
  chat: `<path d="M6 8h36v24H21l-9 8v-8H6z"/><path d="M14 17h20M14 24h13"/>`,
  pointer: `<path d="M12 5l25 15-11 3-5 12z"/><path d="M26 23l9 13"/>`,
  chart: `<path d="M5 43h38"/><rect x="9" y="27" width="6" height="16"/><rect x="21" y="16" width="6" height="27"/><rect x="33" y="8" width="6" height="35"/>`,
  stopwatch: `<circle cx="24" cy="27" r="16"/><path d="M24 27l7-7M19 4h10M24 4v7M38 12l3-3"/>`,
  wifi: `<path d="M5 18a27 27 0 0 1 38 0M11 25a18 18 0 0 1 26 0M17 32a9 9 0 0 1 14 0"/><circle cx="24" cy="39" r="2.2" fill="currentColor"/>`,
  cell: `<rect x="6" y="32" width="6" height="10" rx="1"/><rect x="16" y="24" width="6" height="18" rx="1"/><rect x="26" y="16" width="6" height="26" rx="1"/><rect x="36" y="7" width="6" height="35" rx="1"/>`,
  lock: `<rect x="10" y="21" width="28" height="21" rx="3"/><path d="M16 21v-6a8 8 0 0 1 16 0v6"/><path d="M24 29v6"/>`,
  hex: `<path d="M24 4l17 10v20L24 44 7 34V14z"/><path d="M17 20v8l7 4 7-4v-8l-7-4z"/>`,
  swap: `<path d="M8 17h31M33 11l6 6-6 6M40 31H9M15 25l-6 6 6 6"/>`,
  doc: `<path d="M11 4h18l9 9v31H11z"/><path d="M29 4v9h9M17 23h15M17 30h15M17 37h9"/>`,
  check: `<circle cx="24" cy="24" r="18"/><path d="M15 24l6 6 12-12"/>`,
  calendar: `<rect x="6" y="9" width="36" height="33" rx="3"/><path d="M6 18h36M15 5v8M33 5v8"/><path d="M13 26h5M22 26h5M31 26h5M13 34h5M22 34h5"/>`,
  flag: `<path d="M10 44V5"/><path d="M10 7h26l-6 8 6 8H10"/>`,
  code: `<path d="M16 14L6 24l10 10M32 14l10 10-10 10M27 9l-6 30"/>`,
  flask: `<path d="M18 5h12M21 5v14L9 39a3 3 0 0 0 2.6 5h24.8A3 3 0 0 0 39 39L27 19V5"/><path d="M13 32h22"/>`,
  slides: `<rect x="5" y="6" width="38" height="25" rx="2"/><path d="M24 31v7M15 44l9-6 9 6M12 23l7-7 6 5 9-9"/>`,
  qr: `<rect x="6" y="6" width="14" height="14" rx="1"/><rect x="28" y="6" width="14" height="14" rx="1"/><rect x="6" y="28" width="14" height="14" rx="1"/><path d="M11 11h4v4h-4zM33 11h4v4h-4zM11 33h4v4h-4z" fill="currentColor"/><path d="M28 28h5v5M38 28h4M28 38h4v4M37 35v7h5v-4"/>`,
  user: `<circle cx="24" cy="15" r="8"/><path d="M8 43a16 16 0 0 1 32 0"/>`,
  wrench: `<path d="M30 6a10 10 0 0 0-9 14L6 35a4 4 0 0 0 6 6l15-15a10 10 0 0 0 14-9l-6 6-6-2-2-6z"/>`,
  folder: `<path d="M4 12a3 3 0 0 1 3-3h11l4 5h19a3 3 0 0 1 3 3v22a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"/>`,
  terminal: `<rect x="4" y="7" width="40" height="34" rx="3"/><path d="M12 18l7 6-7 6M23 31h12"/>`,
  shield: `<path d="M24 4l17 6v12c0 11-7 18-17 22C14 40 7 33 7 22V10z"/><path d="M16 23l6 6 10-11"/>`,
};

(function inject() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.innerHTML =
    '<defs>' +
    Object.entries(ICONS)
      .map(
        ([k, v]) =>
          `<symbol id="i-${k}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${v}</symbol>`,
      )
      .join('') +
    '</defs>';
  document.body.prepend(svg);
})();
