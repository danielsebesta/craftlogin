import { english } from '../../locales/en.js';
import { escapeHtml } from '../html.js';

export const THEME_COLOR = '#0b0e0b';

export interface DocumentNavigationItem {
  readonly href: string;
  readonly label: string;
  readonly current?: boolean;
}

export interface DocumentHeader {
  readonly brand: string;
  readonly brandHref?: string;
  readonly navigation?: {
    readonly label: string;
    readonly items: readonly DocumentNavigationItem[];
    readonly trailing?: string;
  };
}

export interface PageDocument {
  readonly content: string;
  readonly description?: string;
  readonly footer: readonly string[];
  readonly headExtra?: string;
  readonly header: DocumentHeader;
  readonly layout?: 'narrow' | 'wide';
  readonly mainAttributes?: string;
  readonly mainClass: string;
  readonly script?: string;
  readonly stylesheet: string;
  readonly title: string;
}

const brandMark = '<img class="brand-mark" src="/favicon.svg" alt="" width="20" height="20">';

export function renderPageDocument(page: PageDocument): string {
  const description =
    page.description === undefined
      ? ''
      : `\n    <meta name="description" content="${escapeHtml(page.description)}">`;
  const script =
    page.script === undefined
      ? ''
      : `\n    <script src="${escapeHtml(page.script)}" defer></script>`;
  const headExtra = page.headExtra === undefined ? '' : `\n    ${page.headExtra}`;
  const brandText = `${brandMark}${escapeHtml(page.header.brand)}`;
  const brand =
    page.header.brandHref === undefined
      ? `<span class="brand">${brandText}</span>`
      : `<a class="brand" href="${escapeHtml(page.header.brandHref)}">${brandText}</a>`;
  const navigation =
    page.header.navigation === undefined
      ? ''
      : `
      <nav class="page-nav" aria-label="${escapeHtml(page.header.navigation.label)}">
${page.header.navigation.items
  .map(
    (item): string =>
      `        <a href="${escapeHtml(item.href)}"${item.current === true ? ' aria-current="page"' : ''}>${escapeHtml(item.label)}</a>`,
  )
  .join('\n')}
${page.header.navigation.trailing ?? ''}
      </nav>`;
  const footer = [...page.footer, english.common.legalDisclaimer, english.common.operator]
    .map((line): string => `<p>${escapeHtml(line)}</p>`)
    .join('\n        ');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="theme-color" content="${THEME_COLOR}">${description}
    <title>${escapeHtml(page.title)}</title>
    <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="shortcut icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-title" content="CraftLogin" />
    <link rel="manifest" href="/site.webmanifest" />
    <link rel="stylesheet" href="${escapeHtml(page.stylesheet)}">${script}${headExtra}
  </head>
  <body${page.layout === 'narrow' ? ' class="page-narrow"' : ''}>
    <a class="skip-link" href="#main">${escapeHtml(english.common.skipToContent)}</a>
    <header class="page-header">
      <div class="page-header-inner">
        ${brand}${navigation}
      </div>
    </header>
    <main id="main" class="${escapeHtml(page.mainClass)}"${page.mainAttributes ?? ''}>
${page.content}
    </main>
    <footer class="page-footer">
      <div class="page-footer-inner">
        ${footer}
      </div>
    </footer>
  </body>
</html>`;
}
