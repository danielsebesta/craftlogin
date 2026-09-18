import { english } from '../../locales/en.js';
import { renderPageDocument } from '../ui/document.js';

export function renderConsoleShell(
  title: string,
  main: { readonly attributes?: string; readonly className: string; readonly content: string },
  options: { readonly identity?: string; readonly script?: boolean } = {},
): string {
  const strings = english.developer;

  return renderPageDocument({
    content: main.content,
    footer: [strings.footer],
    header: {
      brand: strings.navigation.brand,
      ...(options.identity === undefined
        ? {}
        : {
            navigation: {
              items: [],
              label: strings.navigation.ariaLabel,
              trailing: options.identity,
            },
          }),
    },
    layout: 'wide',
    mainClass: main.className,
    ...(main.attributes === undefined ? {} : { mainAttributes: main.attributes }),
    ...(options.script === true ? { script: '/assets/interaction.js' } : {}),
    stylesheet: '/assets/developer.css',
    title: `${title} · ${strings.navigation.brand}`,
  });
}
