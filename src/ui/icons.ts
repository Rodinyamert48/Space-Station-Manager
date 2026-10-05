/** Inline SVG icon set (stroke icons on a 24x24 grid). Static trusted strings only. */
const ICONS = {
  credits: '<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2c-.6-1-1.7-1.5-2.8-1.5-1.6 0-2.8.9-2.8 2.1 0 2.9 5.8 1.6 5.8 4.4 0 1.3-1.3 2.2-3 2.2-1.2 0-2.4-.6-3-1.6M12 6v1.7M12 16.4V18"/>',
  energy: '<path d="M13.5 2.5 5 13.5h6l-1.5 8 8.5-11h-6z"/>',
  oxygen: '<circle cx="9" cy="13" r="5.5"/><circle cx="17.5" cy="7" r="3.2"/><path d="M7 13a2 2 0 1 0 4 0 2 2 0 1 0-4 0"/>',
  water: '<path d="M12 3.2s-6.2 7-6.2 11.3a6.2 6.2 0 0 0 12.4 0C18.2 10.2 12 3.2 12 3.2z"/><path d="M9.3 15a2.8 2.8 0 0 0 2.7 2.6"/>',
  food: '<path d="M12 21v-9M12 12c0-4 2.5-7 6-8 0 4-2.5 7-6 8zM12 15c0-3-2-5.6-5.5-6.4 0 3 2 5.6 5.5 6.4z"/>',
  fuel: '<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3.5 21h13M5 10h10M15 8l3 2.5V17a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
  metal: '<path d="M3 16.5 7 9h10l4 7.5zM7 9l2-4h6l2 4M3 16.5h18v2.5H3z"/>',
  electronics: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3"/>',
  titanium: '<path d="M12 2.5 20.5 8v8L12 21.5 3.5 16V8z"/><path d="M12 2.5v19M3.5 8l17 8M20.5 8l-17 8"/>',
  research: '<path d="M9.5 3h5M10.5 3v6L5 18.5A1.7 1.7 0 0 0 6.5 21h11a1.7 1.7 0 0 0 1.5-2.5L13.5 9V3"/><path d="M7.5 15h9"/>',
  crew: '<circle cx="9" cy="8" r="3.3"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.3c3 .1 5.5 2.3 5.5 5.7"/>',
  build: '<path d="M14.5 6.5 17.5 3.5l3 3-3 3M3.5 20.5l9-9M12.5 11.5l3-3M5 6l5 5M4 3.5 6.5 6 4 8.5 1.5 6z"/>',
  ship: '<path d="M12 2.5c3 3 4.2 7 4.2 11l2.8 3.5h-4.2L12 21.5 9.2 17H5l2.8-3.5c0-4 1.2-8 4.2-11z"/><circle cx="12" cy="10" r="1.8"/>',
  market: '<path d="M3.5 20.5h17M5.5 17V11M10 17V7M14.5 17v-5M19 17V4"/>',
  missions: '<path d="M6 21V4M6 4h11l-2.5 4L17 12H6"/>',
  stats: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5V12l6 6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  ff: '<path d="M4 5v14l8-7zM12 5v14l8-7z"/>',
  rotate: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4.5V11h-6.5"/>',
  check: '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13.5h10L18 7M10 11v6M14 11v6"/>',
  power: '<path d="M12 3v8M7.1 6.3a7 7 0 1 0 9.8 0"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L12 19a2.1 2.1 0 1 1-3-3l7.7-7.7a4 4 0 0 0-2-2z"/>',
  warning: '<path d="M12 3.5 21.5 20h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.3"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  save: '<path d="M5 3.5h11l3.5 3.5v13.5h-14.5zM8 3.5v5h7v-5M8 20.5v-6h8v6"/>',
  dock: '<rect x="3.5" y="9" width="8" height="6" rx="1"/><path d="M11.5 12h3M14.5 8v8M17 7.5h3.5v9H17"/>',
  stage: '<path d="M4 20h16M6 20V10l6-6 6 6v10M10 20v-5h4v5"/>',
  happy: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14a4 4 0 0 0 7 0M9 9.5v.3M15 9.5v.3"/>',
  health: '<path d="M12 20.5s-8-4.7-8-10.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.9c0 5.9-8 10.6-8 10.6z"/>',
  bolt: '<path d="M13.5 2.5 5 13.5h6l-1.5 8 8.5-11h-6z"/>',
  locked: '<rect x="5" y="11" width="14" height="9.5" rx="1.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  reputation: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.6 7.5 9.5 4.3-.9 7.5-4.9 7.5-9.5V6z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  focus: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><circle cx="12" cy="12" r="2.5"/>',
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, cls = ''): SVGSVGElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return wrapper.firstChild as SVGSVGElement;
}
