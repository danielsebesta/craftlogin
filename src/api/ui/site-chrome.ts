import { english } from '../../locales/en.js';
import type { DocumentHeader, DocumentNavigationItem } from './document.js';

const SOURCE_URL = 'https://github.com/danielsebesta/craftlogin';

export type SitePage = '/' | '/docs/' | '/account';

// Shared header/footer so the navbar and footer can't drift between pages.
export function siteHeader(current: SitePage): DocumentHeader {
  const strings = english.landing.navigation;
  const items: DocumentNavigationItem[] = [
    {
      href: '/account',
      icon: 'user',
      label: strings.account,
      ...(current === '/account' ? { current: true as const } : {}),
    },
    { href: '/developers', icon: 'key', label: strings.developers },
    {
      href: '/docs/',
      icon: 'bookOpen',
      label: strings.documentation,
      ...(current === '/docs/' ? { current: true as const } : {}),
    },
    { href: SOURCE_URL, icon: 'github', label: strings.github },
  ];
  return {
    brand: strings.brand,
    brandHref: '/',
    navigation: { items, label: strings.ariaLabel },
  };
}
