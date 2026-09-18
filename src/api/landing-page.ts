import { english } from '../locales/en.js';
import { escapeHtml } from './html.js';
import { renderPageDocument } from './ui/document.js';

const SOURCE_URL = 'https://github.com/danielsebesta/craftlogin';

// Public, long-lived demo identity whose signed skin showcases the avatar renders.
const AVATAR_DEMO_UUID = '069a79f4-44e9-4726-a5be-fca90e38aaf5';

export interface LandingPageInput {
  readonly showDocumentation: boolean;
}

interface Section {
  readonly body: string;
  readonly id: string;
  readonly title: string;
}

function renderSteps(): string {
  return english.landing.flow.items
    .map(
      (item, index): string => `
            <li>
              <span class="step-index" aria-hidden="true">${(index + 1).toString()}.</span>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.detail)}</p>
            </li>`,
    )
    .join('');
}

export function renderLandingPage(input: LandingPageInput): string {
  const strings = english.landing;
  const claims = strings.claims;

  const secondaryAction = input.showDocumentation
    ? `<a class="button button-secondary" href="/docs/">${escapeHtml(strings.hero.documentationAction)}</a>`
    : `<a class="button button-secondary" href="${SOURCE_URL}">${escapeHtml(strings.hero.githubAction)}</a>`;

  const sections: readonly Section[] = [
    {
      body: `<ol class="landing-steps">${renderSteps()}
          </ol>
          <dl class="summary-list landing-example">
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
      body: `<ul class="use-list">${strings.useCases.items
        .map(
          (item): string => `
            <li>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.detail)}</p>
            </li>`,
        )
        .join('')}
          </ul>`,
      id: 'uses',
      title: strings.useCases.heading,
    },
    {
      body: `<p class="section-intro">${escapeHtml(strings.quickstart.text)}</p>
          <pre class="code-block" tabindex="0" aria-label="${escapeHtml(strings.quickstart.heading)}"><code>${escapeHtml(strings.hero.request)}</code></pre>
          <h3>${escapeHtml(strings.quickstart.exchangeHeading)}</h3>
          <pre class="code-block" tabindex="0" aria-label="${escapeHtml(strings.quickstart.exchangeHeading)}"><code>${escapeHtml(strings.quickstart.exchangeCode)}</code></pre>`,
      id: 'quickstart',
      title: strings.quickstart.heading,
    },
    {
      body: `<p class="section-intro">${escapeHtml(claims.text)}</p>
          <div class="table-wrap">
            <table class="table">
              <caption class="visually-hidden">${escapeHtml(claims.heading)}</caption>
              <thead>
                <tr>
                  <th scope="col">${escapeHtml(claims.claimHeading)}</th>
                  <th scope="col">${escapeHtml(claims.valueHeading)}</th>
                  <th scope="col">${escapeHtml(claims.detailHeading)}</th>
                </tr>
              </thead>
              <tbody>
                ${claims.rows
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
          <h3>${escapeHtml(claims.scopesHeading)}</h3>
          <dl class="summary-list">
            ${claims.scopes
              .map(
                (scope): string => `<div>
              <dt><code>${escapeHtml(scope.name)}</code></dt>
              <dd>${escapeHtml(scope.detail)}</dd>
            </div>`,
              )
              .join('\n            ')}
          </dl>`,
      id: 'claims',
      title: claims.heading,
    },
    {
      body: `<p class="section-intro">${escapeHtml(strings.avatars.text)}</p>
          <ul class="avatar-showcase">
            ${(
              [
                { label: strings.avatars.face, view: 'face' },
                { label: strings.avatars.head, view: 'head' },
                { label: strings.avatars.bust, view: 'bust' },
                { label: strings.avatars.body, view: 'body' },
              ] as const
            )
              .map(
                (item): string => `<li class="avatar-card">
              <img src="/api/avatars/${AVATAR_DEMO_UUID}/${item.view}" alt="${escapeHtml(strings.avatars.exampleAlt)}: ${escapeHtml(item.label)}" width="128" height="128" loading="lazy" decoding="async">
              <h3>${escapeHtml(item.label)}</h3>
              <code>/api/avatars/:uuid/${item.view}</code>
            </li>`,
              )
              .join('\n            ')}
          </ul>`,
      id: 'avatars',
      title: strings.avatars.heading,
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
      body: `<p class="section-intro">${escapeHtml(strings.security.text)}</p>`,
      id: 'security',
      title: strings.security.heading,
    },
  ];

  return renderPageDocument({
    content: `      <section class="landing-hero" aria-labelledby="hero-heading">
        <h1 id="hero-heading">${escapeHtml(strings.hero.heading)}</h1>
        <p class="landing-lead">${escapeHtml(strings.hero.lead)}</p>
        <p class="notice">${escapeHtml(strings.affiliation)}</p>
        <div class="button-row landing-actions">
          <a class="button" href="/developers">${escapeHtml(strings.hero.consoleAction)}</a>
          ${secondaryAction}
        </div>
        <figure class="landing-request">
          <figcaption>${escapeHtml(strings.hero.codeLabel)}</figcaption>
          <pre class="code-block" tabindex="0" aria-label="${escapeHtml(strings.hero.codeLabel)}"><code>${escapeHtml(strings.hero.request)}</code></pre>
        </figure>
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
    footer: [`${strings.navigation.brand} · ${strings.footer.license}`],
    header: {
      brand: strings.navigation.brand,
      brandHref: '/',
      navigation: {
        items: [
          { href: '/developers', label: strings.navigation.developers },
          { href: '/docs/integrations/ai', label: strings.navigation.integration },
          ...(input.showDocumentation
            ? [{ href: '/docs/', label: strings.navigation.documentation }]
            : []),
          { href: SOURCE_URL, label: strings.navigation.github },
        ],
        label: strings.navigation.ariaLabel,
      },
    },
    mainClass: 'container',
    stylesheet: '/assets/landing.css',
    title: `${strings.navigation.brand} · ${strings.hero.heading}`,
  });
}
