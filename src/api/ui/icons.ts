/**
 * Icons vendored from the free Pixelarticons set (MIT licensed, 24×24 pixel grid,
 * https://pixelarticons.com/svg/<name>.svg). The path data is inlined verbatim so
 * `fill="currentColor"` follows the surrounding text color, which an `<img>`
 * reference cannot do, and so the pages stay free of an extra HTTP request.
 *
 * Render them at a multiple of 24 CSS pixels to keep the pixels crisp.
 */
const ICON_PATHS = {
  bookOpen:
    'M2 3h9v2H2zM0 19h11v2H0zM13 3h9v2h-9zm0 16h11v2H13zM11 5h2v18h-2zM0 5h2v14H0zm22 0h2v14h-2zm-7 2h5v2h-5zm0 4h5v2h-5zm0 4h2v2h-2z',
  briefcase:
    'M2 8h2v12H2zm18 0h2v12h-2zM4 6h16v2H4zm0 14h16v2H4zM8 4h2v2H8zm2-2h4v2h-4zm4 2h2v2h-2z',
  check:
    'M10 18H8v-2h2v2Zm-2-2H6v-2h2v2Zm4-2v2h-2v-2h2Zm-6 0H4v-2h2v2Zm8 0h-2v-2h2v2Zm2-2h-2v-2h2v2Zm2-2h-2V8h2v2Zm2-2h-2V6h2v2Z',
  clock:
    'M18 22H6v-2h12v2ZM6 20H4v-2h2v2Zm14 0h-2v-2h2v2ZM4 18H2V6h2v12Zm18 0h-2V6h2v12Zm-5-1h-2v-2h2v2Zm-2-2h-2v-2h2v2Zm-2-2h-2V6h2v7ZM6 6H4V4h2v2Zm14 0h-2V4h2v2Zm-2-2H6V2h12v2Z',
  code: 'M11 18H9v-4h2v4Zm-4-1H5v-2h2v2Zm12-2v2h-2v-2h2ZM5 15H3v-2h2v2Zm16 0h-2v-2h2v2Zm-8-1h-2v-4h2v4ZM3 13H1v-2h2v2Zm20 0h-2v-2h2v2ZM5 11H3V9h2v2Zm16 0h-2V9h2v2Zm-6-1h-2V6h2v4ZM7 9H5V7h2v2Zm12 0h-2V7h2v2Z',
  externalLink:
    'M11 5H5v2h6V5ZM5 7H3v12h2V7Zm12 12H5v2h12v-2Zm2-6h-2v6h2v-6Zm-8 0H9v2h2v-2Zm2-2h-2v2h2v-2Zm2-2h-2v2h2V9Zm2-2h-2v2h2V7Zm2-2h-2v2h2V5Zm2-2h-2v8h2V3ZM21 3h-8v2h8V3Z',
  gamepad:
    'M4 4h16v2H4zm0 14h16v2H4zM2 6h2v12H2zm18 0h2v12h-2zM8 9h2v6H8zM6 11h6v2H6zm8-2h2v2h-2zm2 4h2v2h-2z',
  home: 'M4 20h16v2H4zm16-10h2v10h-2zM2 10h2v10H2zm2-2h2v2H4zm2-2h2v2H6zm2-2h2v2H8zm2-2h4v2h-4zm4 2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zM8 14h2v6H8zm2-2h4v2h-4zm4 2h2v6h-2z',
  info: 'M4 2h16v2H4zm0 18h16v2H4zM2 4h2v16H2zm18 0h2v16h-2zm-9 5h2V7h-2zm0 8h2v-6h-2z',
  key: 'M11 18H3V16H11V18ZM23 15H21V18H17V16H19V13H21V11H11V8H13V9H23V15ZM3 16H1V8H3V16ZM17 16H15V15H13V16H11V13H17V16ZM9 14H5V10H9V14ZM11 8H3V6H11V8Z',
  link: 'M4 6h7v2H4zm0 10h7v2H4zM2 8h2v8H2zm18-2h-7v2h7zm0 10h-7v2h7zm2-8h-2v8h2zM7 11h10v2H7z',
  lock: 'M5 8h14v2H5zm0 12h14v2H5zM3 10h2v10H3zm16 0h2v10h-2zM7 4h2v4H7zm2-2h6v2H9zm6 2h2v4h-2z',
  login:
    'M2 11h14v2H2zm10-2h2v2h-2zM10 7h2v10h-2zm2 6h2v2h-2zM6 2h12v2H6zm0 18h12v2H6zM4 4h2v5H4zm0 11h2v5H4zM18 4h2v16h-2z',
  logout:
    'M8 11h12v2H8zm8-2h2v2h-2zM14 7h2v10h-2zm2 6h2v2h-2zM6 2h12v2H6zm0 18h12v2H6zM4 4h2v16H4zm14 0h2v3h-2zm0 13h2v3h-2z',
  refresh:
    'M13 20H9V18H13V20ZM19 16H21V18H19V20H17V18H15V16H17V8H19V16ZM9 18H7V16H9V18ZM7 6H9V8H7V16H5V8H3V6H5V4H7V6ZM15 16H13V14H15V16ZM23 16H21V14H23V16ZM3 10H1V8H3V10ZM11 10H9V8H11V10ZM17 8H15V6H17V8ZM15 6H11V4H15V6Z',
  server: 'M6 7h4v2H6zm0 8h4v2H6zM2 5h2v14H2zm18 0h2v14h-2zM4 19h16v2H4zM4 3h16v2H4zm0 8h16v2H4z',
  shield:
    'M14 22h-4v-2h4v2Zm-4-4v2H8v-2h2Zm6 2h-2v-2h2v2Zm-8-2H6v-2h2v2Zm10 0h-2v-2h2v2ZM6 16H4v-2h2v2Zm14 0h-2v-2h2v2ZM4 14H2V4h2v10Zm18 0h-2V4h2v10ZM20 4H4V2h16v2Z',
  user: 'M9 2h6v2H9zm0 8h6v2H9zm6-6h2v6h-2zM7 4h2v6H7zM4 18h2v4H4zm14 0h2v4h-2zM8 14h8v2H8zm-2 2h2v2H6zm10 0h2v2h-2z',
  users:
    'M5 2h6v2H5zm10 0h4v2h-4zM5 10h6v2H5zm10 0h4v2h-4zm4-6h2v6h-2zm-8 0h2v6h-2zM3 4h2v6H3zM0 18h2v4H0zm14 0h2v4h-2zm8 0h2v4h-2zM4 14h8v2H4zm12 0h4v2h-4zM2 16h2v2H2zm10 0h2v2h-2zm8 0h2v2h-2z',
  warning:
    'M2 10h2v2H2zm0 4h2v-2H2zm20-4h-2v2h2zm0 4h-2v-2h2zM4 8h2v2H4zm0 8h2v-2H4zm16-8h-2v2h2zm0 8h-2v-2h2zM6 6h2v2H6zm0 12h2v-2H6zM18 6h-2v2h2zm0 12h-2v-2h2zM8 4h2v2H8zm0 16h2v-2H8zm8-16h-2v2h2zm0 16h-2v-2h2zM10 2h2v2h-2zm0 20h2v-2h-2zm4-20h-2v2h2zm0 20h-2v-2h2zm-3-5h2v-2h-2zm0-4h2V7h-2z',
} as const;

export type IconName = keyof typeof ICON_PATHS;

/**
 * Icons are always decorative: every icon ships next to a visible text label,
 * so exposing it to assistive technology would only duplicate that label.
 */
export function renderIcon(name: IconName, className = 'ui-icon'): string {
  return `<svg aria-hidden="true" class="${className}" fill="currentColor" focusable="false" height="24" viewBox="0 0 24 24" width="24"><path d="${ICON_PATHS[name]}"/></svg>`;
}

// Microsoft logo redrawn for the 24x24 pixel grid: four 10x10 brand squares
// with 2px gaps. Unlike the single-color set above, each square keeps its
// brand fill so the mark stays recognizable at small sizes.
const MICROSOFT_SQUARES: readonly {
  readonly color: string;
  readonly x: number;
  readonly y: number;
}[] = [
  { color: '#f25022', x: 2, y: 2 },
  { color: '#7fba00', x: 12, y: 2 },
  { color: '#00a4ef', x: 2, y: 12 },
  { color: '#ffb900', x: 12, y: 12 },
];

export function renderMicrosoftIcon(className = 'ui-icon'): string {
  const squares = MICROSOFT_SQUARES.map(
    (square): string =>
      `<rect x="${square.x}" y="${square.y}" width="10" height="10" fill="${square.color}"/>`,
  ).join('');
  return `<svg aria-hidden="true" class="${className}" focusable="false" height="24" viewBox="0 0 24 24" width="24">${squares}</svg>`;
}
