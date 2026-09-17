/**
 * Icons vendored from the free Pixelarticons set (MIT licensed, 24×24 pixel grid,
 * https://pixelarticons.com/svg/<name>.svg). The path data is inlined verbatim so
 * `fill="currentColor"` follows the surrounding text color, which an `<img>`
 * reference cannot do, and so the pages stay free of an extra HTTP request.
 *
 * Render them at a multiple of 24 CSS pixels to keep the pixels crisp.
 */
const ICON_PATHS = {
  check:
    'M10 18H8v-2h2v2Zm-2-2H6v-2h2v2Zm4-2v2h-2v-2h2Zm-6 0H4v-2h2v2Zm8 0h-2v-2h2v2Zm2-2h-2v-2h2v2Zm2-2h-2V8h2v2Zm2-2h-2V6h2v2Z',
  clock:
    'M18 22H6v-2h12v2ZM6 20H4v-2h2v2Zm14 0h-2v-2h2v2ZM4 18H2V6h2v12Zm18 0h-2V6h2v12Zm-5-1h-2v-2h2v2Zm-2-2h-2v-2h2v2Zm-2-2h-2V6h2v7ZM6 6H4V4h2v2Zm14 0h-2V4h2v2Zm-2-2H6V2h12v2Z',
  shield:
    'M14 22h-4v-2h4v2Zm-4-4v2H8v-2h2Zm6 2h-2v-2h2v2Zm-8-2H6v-2h2v2Zm10 0h-2v-2h2v2ZM6 16H4v-2h2v2Zm14 0h-2v-2h2v2ZM4 14H2V4h2v10Zm18 0h-2V4h2v10ZM20 4H4V2h16v2Z',
} as const;

export type IconName = keyof typeof ICON_PATHS;

/**
 * Icons are always decorative: every badge and action ships a visible text label,
 * so exposing the icon to assistive technology would only duplicate it.
 */
export function renderIcon(name: IconName, className: string): string {
  return `<svg aria-hidden="true" class="${className}" fill="currentColor" focusable="false" height="24" viewBox="0 0 24 24" width="24"><path d="${ICON_PATHS[name]}"/></svg>`;
}
