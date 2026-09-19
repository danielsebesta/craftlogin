import { english } from '../../locales/en.js';
import type { DocumentHeader, DocumentNavigationItem } from './document.js';

const SOURCE_URL = 'https://github.com/danielsebesta/craftlogin';

export type SitePage = '/' | '/docs/';

// Single shared header and footer for every public page, so the navbar and
// footer never drift between the landing page and the documentation.
export function siteHeader(current: SitePage): DocumentHeader {
  const strings = english.landing.navigation;
  const items: DocumentNavigationItem[] = [
    { href: '/developers', icon: 'key', label: strings.developers },
    {
      href: '/docs/',
      icon: 'bookOpen',
      label: strings.documentation,
      ...(current === '/docs/' ? { current: true as const } : {}),
    },
    { href: SOURCE_URL, icon: 'externalLink', label: strings.github },
  ];
  return {
    brand: strings.brand,
    brandHref: '/',
    navigation: { items, label: strings.ariaLabel },
  };
}

export function siteFooter(): readonly string[] {
  const strings = english.landing;
  return [`${strings.navigation.brand} · ${strings.footer.license}`];
}
