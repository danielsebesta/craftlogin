import { english } from '../locales/en.js';
import { escapeHtml } from './html.js';
import { renderPageDocument } from './ui/document.js';

const SOURCE_URL = 'https://github.com/danielsebesta/craftlogin';

export interface LandingPageInput {
  readonly showDocumentation: boolean;
}

interface Section {
  readonly body: string;
  readonly id: string;
  readonly title: string;
}

export function renderLandingPage(input: LandingPageInput): string {
  const strings = english.landing;
  const navigation = {
    items: [
      { href: '/developers', label: strings.navigation.developers },
      ...(input.showDocumentation
        ? [{ href: '/docs/', label: strings.navigation.documentation }]
        : []),
      { href: SOURCE_URL, label: strings.navigation.github },
    ],
    label: strings.navigation.ariaLabel,
  };
  const secondaryAction = input.showDocumentation
    ? `<a class="button button-secondary" href="/docs/">${escapeHtml(strings.hero.documentationAction)}</a>`
    : `<a class="button button-secondary" href="${SOURCE_URL}">${escapeHtml(strings.hero.githubAction)}</a>`;

  const sections: readonly Section[] = [
    {
      body: `<p>${escapeHtml(strings.quickstart.text)}</p>
          <pre class="code-block" tabindex="0" aria-label="${escapeHtml(strings.quickstart.heading)}"><code>${escapeHtml(strings.quickstart.code)}</code></pre>
          <h3>${escapeHtml(strings.quickstart.exchangeHeading)}</h3>
          <pre class="code-block" tabindex="0" aria-label="${escapeHtml(strings.quickstart.exchangeHeading)}"><code>${escapeHtml(strings.quickstart.exchangeCode)}</code></pre>`,
      id: 'quickstart',
      title: strings.quickstart.heading,
    },
    {
      body: `<ol class="flow-list">
            ${strings.flow.items
              .map(
                (item): string =>
                  `<li><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.detail)}</p></li>`,
              )
              .join('\n            ')}
          </ol>
          <dl class="summary-list">
            <div>
              <dt>${escapeHtml(strings.flow.exampleLabel)}</dt>
              <dd><code>${escapeHtml(strings.flow.exampleAddress)}</code></dd>
            </div>
            <div>
              <dt>${escapeHtml(strings.flow.claimLabel)}</dt>
              <dd><code>${escapeHtml(strings.flow.claimValue)}</code></dd>
            </div>
          </dl>`,
      id: 'flow',
      title: strings.flow.heading,
    },
    {
      body: `<div class="table-wrap">
            <table class="table">
              <caption class="visually-hidden">${escapeHtml(strings.claims.heading)}</caption>
              <thead>
                <tr>
                  <th scope="col">${escapeHtml(strings.claims.claimHeading)}</th>
                  <th scope="col">${escapeHtml(strings.claims.valueHeading)}</th>
                  <th scope="col">${escapeHtml(strings.claims.detailHeading)}</th>
                </tr>
              </thead>
              <tbody>
                ${strings.claims.rows
                  .map(
                    (row): string => `<tr>
                  <th scope="row"><code>${escapeHtml(row.claim)}</code></th>
                  <td><code>${escapeHtml(row.value)}</code></td>
                  <td>${escapeHtml(row.detail)}</td>
                </tr>`,
                  )
                  .join('\n                ')}
              </tbody>
            </table>
          </div>
          <h3>${escapeHtml(strings.claims.scopesHeading)}</h3>
          <dl class="summary-list">
            ${strings.claims.scopes
              .map(
                (scope): string => `<div>
              <dt><code>${escapeHtml(scope.name)}</code></dt>
              <dd>${escapeHtml(scope.detail)}</dd>
            </div>`,
              )
              .join('\n            ')}
          </dl>`,
      id: 'claims',
      title: strings.claims.heading,
    },
    {
      body: `<ul class="endpoint-list">
            ${strings.endpoints.items
              .map(
                (endpoint): string =>
                  `<li><code>${escapeHtml(endpoint.path)}</code><span class="muted">${escapeHtml(endpoint.detail)}</span></li>`,
              )
              .join('\n            ')}
          </ul>`,
      id: 'endpoints',
      title: strings.endpoints.heading,
    },
    {
      body: `<p>${escapeHtml(strings.security.text)}</p>`,
      id: 'security',
      title: strings.security.heading,
    },
  ];

  return renderPageDocument({
    content: `      <section class="landing-hero" aria-labelledby="hero-heading">
        <h1 id="hero-heading">${escapeHtml(strings.hero.heading)}</h1>
        <p class="lead">${escapeHtml(strings.hero.lead)}</p>
        <div class="button-row">
          <a class="button" href="/developers">${escapeHtml(strings.hero.consoleAction)}</a>
          ${secondaryAction}
        </div>
      </section>
${sections
  .map(
    (section): string => `
      <section class="landing-section" aria-labelledby="${section.id}-heading">
        <h2 id="${section.id}-heading">${escapeHtml(section.title)}</h2>
        ${section.body}
      </section>`,
  )
  .join('')}`,
    description: strings.hero.lead,
    footer: [`${strings.navigation.brand} · ${strings.footer.license}`, strings.affiliation],
    header: {
      brand: strings.navigation.brand,
      brandHref: '/',
      navigation,
    },
    mainClass: 'container',
    stylesheet: '/assets/landing.css',
    title: `${strings.navigation.brand} · ${strings.hero.heading}`,
  });
}
