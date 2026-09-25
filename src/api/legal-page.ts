import { english } from '../locales/en.js';
import { escapeHtml } from './html.js';
import { renderPageDocument } from './ui/document.js';
import { siteFooter, siteHeader } from './ui/site-chrome.js';

export type LegalPageKind = 'privacy' | 'terms';

interface LegalSectionStrings {
  readonly heading: string;
  readonly items?: readonly string[] | undefined;
  readonly paragraphs?: readonly string[] | undefined;
}

interface LegalPageStrings {
  readonly description: string;
  readonly intro: string;
  readonly sections: readonly LegalSectionStrings[];
  readonly title: string;
}

// One renderer for both pages so structure can't drift; only content differs.
const LEGAL_PAGES: Record<LegalPageKind, LegalPageStrings> = {
  privacy: english.legal.privacy,
  terms: english.legal.terms,
};

function renderSection(kind: LegalPageKind, index: number, section: LegalSectionStrings): string {
  const headingId = `${kind}-section-${String(index + 1)}`;
  const blocks: string[] = (section.paragraphs ?? []).map(
    (paragraph): string => `          <p>${escapeHtml(paragraph)}</p>`,
  );
  if (section.items !== undefined && section.items.length > 0) {
    blocks.push(
      `          <ul class="legal-list">\n${section.items
        .map((item): string => `            <li>${escapeHtml(item)}</li>`)
        .join('\n')}\n          </ul>`,
    );
  }

  return `        <section class="legal-section" aria-labelledby="${headingId}">
          <h2 id="${headingId}">${escapeHtml(section.heading)}</h2>
${blocks.join('\n')}
        </section>`;
}

export function renderLegalPage(kind: LegalPageKind): string {
  const strings = LEGAL_PAGES[kind];
  return renderPageDocument({
    content: `      <article class="legal-page">
        <h1>${escapeHtml(strings.title)}</h1>
        <p class="section-intro">${escapeHtml(strings.intro)}</p>
        <p class="legal-updated">${escapeHtml(english.legal.lastUpdated)}</p>
${strings.sections.map((section, index): string => renderSection(kind, index, section)).join('\n')}
      </article>`,
    description: strings.description,
    footer: siteFooter(),
    header: siteHeader('/'),
    mainClass: 'container section',
    stylesheet: '/assets/legal.css',
    title: `${english.landing.navigation.brand} · ${strings.title}`,
  });
}
