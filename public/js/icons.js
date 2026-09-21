// Minimal hand-authored line-icon set (24x24, stroke-based) so the UI never
// depends on emoji glyphs rendering consistently across devices.
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V20a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1V9.5"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
  plusCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  receipt: '<path d="M6 3h12a1 1 0 0 1 1 1v16.2a.5.5 0 0 1-.76.43L16 19l-2.24 1.63a.5.5 0 0 1-.52 0L11 19l-2.24 1.63a.5.5 0 0 1-.52 0L6 19l-2.24 1.63A.5.5 0 0 1 3 20.2V4a1 1 0 0 1 1-1Z"/><path d="M8 8h8M8 12h8M8 16h4"/>',
  barChart: '<path d="M4 20V10M12 20V4M20 20v-7"/><path d="M2 20h20"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2a1 1 0 0 0 .86-.49l.9-1.52A1 1 0 0 1 10.32 4h3.36a1 1 0 0 1 .86.49l.9 1.52a1 1 0 0 0 .86.49h2.2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z"/><circle cx="12" cy="12.5" r="3.4"/>',
  edit: '<path d="M12.5 5.5 16 2l4 4-3.5 3.5"/><path d="M14.5 4.5 4 15v4h4l10.5-10.5"/>',
  trash: '<path d="M4 7h16"/><path d="M9.5 7V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4A1.3 1.3 0 0 1 14.5 4.8V7"/><path d="M6.5 7 7.3 19.4A1.5 1.5 0 0 0 8.8 20.8h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/><path d="M10.3 11v6M13.7 11v6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 19.5h14"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><path d="M14 14h3.2v3.2H14zM17.8 14H21M14 17.8h1.6M19.4 15.6V21M17.2 21H21"/>',
  bag: '<path d="M6.5 9V7a5.5 5.5 0 0 1 11 0v2"/><path d="M4.8 9h14.4l.9 10.5a1.5 1.5 0 0 1-1.5 1.6H5.4a1.5 1.5 0 0 1-1.5-1.6Z"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  alert: '<path d="M12 3.5 22 20.5H2Z"/><path d="M12 10v4.2M12 17.3v.2"/>',
  arrowRight: '<path d="M4 12h15.5"/><path d="m13.5 5.5 6.5 6.5-6.5 6.5"/>',
  chevronLeft: '<path d="M15 5 8 12l7 7"/>',
  box: '<path d="M3.5 8 12 3.5 20.5 8 12 12.5Z"/><path d="M3.5 8v8L12 20.5 20.5 16V8"/><path d="M12 12.5V20.5"/>',
  sparkle: '<path d="M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21M6 6l2.2 2.2M15.8 15.8 18 18M6 18l2.2-2.2M15.8 8.2 18 6"/>',
  wifi: '<path d="M3 8.5a15 15 0 0 1 18 0"/><path d="M6.3 12a10.5 10.5 0 0 1 11.4 0"/><path d="M9.6 15.5a6 6 0 0 1 4.8 0"/><circle cx="12" cy="19" r="1.1" fill="currentColor" stroke="none"/>',
  refresh: '<path d="M20 11A8 8 0 0 0 6.3 6.3L4 8.6"/><path d="M4 4v4.6h4.6"/><path d="M4 13a8 8 0 0 0 13.7 4.7L20 15.4"/><path d="M20 20v-4.6h-4.6"/>',
  check: '<path d="m4 12.5 5 5 11-11"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m7.5 12.5 3 3 6-6.5"/>',
  xCircle: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.4-3.8 4.4-5.8 7.5-5.8s6.1 2 7.5 5.8"/>',
  phone: '<path d="M6 3.5h2.6l1.2 4-2 1.4a11.5 11.5 0 0 0 5.3 5.3l1.4-2 4 1.2V16a2 2 0 0 1-2.1 2A16 16 0 0 1 4 4.6 2 2 0 0 1 6 3.5Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.2"/><path d="m4 6.5 8 6.2 8-6.2"/>',
  mapPin: '<path d="M12 21.5s7-6.2 7-11.7a7 7 0 1 0-14 0c0 5.5 7 11.7 7 11.7Z"/><circle cx="12" cy="9.8" r="2.5"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5"/>',
  logOut: '<path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4H9"/><path d="M15.5 16.5 20 12l-4.5-4.5"/><path d="M20 12H9"/>',
  creditCard: '<rect x="2.5" y="5.5" width="19" height="13" rx="2.2"/><path d="M2.5 10h19"/><path d="M6 14.5h4"/>',
  printer: '<path d="M6.5 8.5V4h11v4.5"/><rect x="4.5" y="8.5" width="15" height="7" rx="1.6"/><path d="M6.5 13.5h11V20h-11Z"/>',
  store: '<path d="M4 9.5 5.2 4h13.6l1.2 5.5"/><path d="M4 9.5a2.3 2.3 0 0 0 4.5.6 2.3 2.3 0 0 0 4.5 0 2.3 2.3 0 0 0 4.5 0 2.3 2.3 0 0 0 4.5-.6"/><path d="M5.5 9.8V20h13V9.8"/><path d="M9.8 20v-5.2h4.4V20"/>',
  scanLine: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/>',
  whatsapp: '<path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.2A8.5 8.5 0 1 0 12 3.5Z"/><path d="M8.5 8.3c.2-.5.5-.5.8-.5h.5c.2 0 .4 0 .6.4.2.5.7 1.6.7 1.8.1.1.1.3 0 .4-.1.2-.2.3-.3.4l-.4.5c-.1.1-.2.3-.1.5.2.3.7 1.1 1.5 1.8.9.8 1.7 1.1 2 1.2.2.1.4.1.5-.1l.5-.6c.2-.2.3-.2.5-.1l1.5.7c.2.1.4.2.4.3.1.2.1 1-.2 1.4-.3.4-1.3.9-1.9.9-.6 0-1.9-.2-3.6-1.5-2-1.5-3.3-3.5-3.4-3.7-.1-.2-.9-1.3-.9-2.4 0-1.2.6-1.7.8-2Z" fill="currentColor" stroke="none"/>',
};

function icon(name, size = 22, cls = '') {
  const body = ICONS[name] || '';
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
