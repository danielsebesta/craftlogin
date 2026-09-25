import { english } from '../../locales/en.js';
import { escapeHtml } from '../html.js';
import { renderIcon, type IconName } from './icons.js';

export const THEME_COLOR = '#0b0e0b';

export interface DocumentNavigationItem {
  readonly href: string;
  readonly icon?: IconName;
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
  readonly footer?: readonly string[];
  readonly headExtra?: string;
  readonly header: DocumentHeader;
  readonly layout?: 'narrow' | 'wide';
  readonly mainAttributes?: string;
  readonly mainClass: string;
  readonly script?: string | readonly string[];
  readonly stylesheet: string;
  readonly title: string;
}

const brandWordmark =
  '<picture class="brand-wordmark"><source srcset="/assets/brand-wordmark.webp 210w, /assets/brand-wordmark-2x.webp 420w, /assets/craftlogin-title.webp 640w, /assets/craftlogin-title-2x.webp 1280w, /assets/craftlogin-title-master.webp 2048w" sizes="min(85vw, 240px)" type="image/webp"><source srcset="/assets/brand-wordmark.png 210w, /assets/brand-wordmark-2x.png 420w, /assets/craftlogin-title.png 640w, /assets/craftlogin-title-2x.png 1280w, /assets/craftlogin-title-master.png 2048w" sizes="min(85vw, 240px)" type="image/png"><img class="brand-wordmark-image" src="/assets/craftlogin-title.png" alt="CraftLogin" width="640" height="97" decoding="async"></picture>';

export function renderPageDocument(page: PageDocument): string {
  const description =
    page.description === undefined
      ? ''
      : `\n    <meta name="description" content="${escapeHtml(page.description)}">`;
  const script =
    page.script === undefined
      ? ''
      : (typeof page.script === 'string' ? [page.script] : page.script)
          .map((src): string => `\n    <script src="${escapeHtml(src)}" defer></script>`)
          .join('');
  const headExtra = page.headExtra === undefined ? '' : `\n    ${page.headExtra}`;
  const brandText =
    page.header.brand === 'CraftLogin' ? brandWordmark : escapeHtml(page.header.brand);
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
      `        <a href="${escapeHtml(item.href)}"${item.current === true ? ' aria-current="page"' : ''}>${item.icon === undefined ? '' : renderIcon(item.icon, 'nav-icon')}${escapeHtml(item.label)}</a>`,
  )
  .join('\n')}
${page.header.navigation.trailing ?? ''}
      </nav>`;
  const pageFooter = page.footer ?? [];
  const legalDisclaimer = english.common.legalDisclaimer.map(escapeHtml).join('<br>');
  const legalLinks = `<nav class="footer-links" aria-label="${escapeHtml(english.common.legalLinksLabel)}">${english.common.legalLinks
    .map((link): string => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`)
    .join('')}</nav>`;
  const footer = [
    ...pageFooter
      .filter((line): boolean => line.trim().length > 0)
      .map((line): string => `<p class="footer-note">${escapeHtml(line)}</p>`),
    legalLinks,
    `<p class="footer-legal">${legalDisclaimer}</p>`,
    `<p class="footer-operator">${escapeHtml(english.common.operator)}</p>`,
  ].join('\n        ');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="theme-color" content="${THEME_COLOR}">${description}
    <title>${escapeHtml(page.title)}</title>
    <link rel="icon" type="image/webp" href="/favicon-96x96.webp" sizes="96x96" />
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
    <main id="main" class="page-backdrop ${escapeHtml(page.mainClass)}"${page.mainAttributes ?? ''}>
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
