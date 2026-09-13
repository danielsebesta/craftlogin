import { english } from '../../locales/en.js';
import { renderPageDocument, type DocumentNavigationItem } from '../ui/document.js';

/**
 * The console keeps one shared header: brand, the console link, then the signed
 * in developer and the single session action.
 */
export function renderConsoleShell(
  title: string,
  main: { readonly attributes?: string; readonly className: string; readonly content: string },
  options: { readonly identity?: string; readonly script?: boolean } = {},
): string {
  const strings = english.developer;
  const navigation: readonly DocumentNavigationItem[] = [
    { current: true, href: '/developers', label: strings.navigation.console },
  ];

  return renderPageDocument({
    content: main.content,
    footer: [strings.footer],
    header: {
      brand: strings.navigation.brand,
      brandHref: '/',
      navigation: {
        items: navigation,
        label: strings.navigation.ariaLabel,
        ...(options.identity === undefined ? {} : { trailing: options.identity }),
      },
    },
    layout: 'wide',
    mainClass: main.className,
    ...(main.attributes === undefined ? {} : { mainAttributes: main.attributes }),
    ...(options.script === true ? { script: '/assets/interaction.js' } : {}),
    stylesheet: '/assets/developer.css',
    title: `${title} · ${strings.navigation.brand}`,
  });
}
