import { english } from '../locales/en.js';
import { escapeHtml } from './html.js';

const SOURCE_URL = 'https://github.com/danielsebesta/craftlogin';

export interface LandingPageInput {
  readonly showDocumentation: boolean;
}

export function renderLandingPage(input: LandingPageInput): string {
  const strings = english.landing;
  const common = english.common;
  const documentationNav = input.showDocumentation
    ? `<a href="/docs/">${escapeHtml(strings.navigation.documentation)}</a>`
    : '';
  const secondaryAction = input.showDocumentation
    ? `<a class="button button-secondary" href="/docs/">${escapeHtml(strings.hero.documentationAction)}</a>`
    : `<a class="button button-secondary" href="${SOURCE_URL}">${escapeHtml(strings.hero.githubAction)}</a>`;

  const claimRows = strings.claims.rows
    .map(
      (row): string => `<tr>
            <th scope="row"><code>${escapeHtml(row.claim)}</code></th>
            <td><code>${escapeHtml(row.value)}</code></td>
            <td>${escapeHtml(row.detail)}</td>
          </tr>`,
    )
    .join('\n          ');
  const scopeItems = strings.claims.scopes
    .map(
      (scope): string => `<div>
            <dt><code>${escapeHtml(scope.name)}</code></dt>
            <dd>${escapeHtml(scope.detail)}</dd>
          </div>`,
    )
    .join('\n          ');
  const endpoints = strings.endpoints.items
    .map(
      (endpoint): string =>
        `<li><code>${escapeHtml(endpoint.path)}</code><span class="muted">${escapeHtml(endpoint.detail)}</span></li>`,
    )
    .join('\n          ');
  const flowItems = strings.flow.items
    .map(
      (item): string =>
        `<li><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.detail)}</p></li>`,
    )
    .join('\n          ');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="theme-color" content="#0b0e0b">
    <meta name="description" content="${escapeHtml(strings.hero.lead)}">
    <title>${escapeHtml(strings.navigation.brand)} · ${escapeHtml(strings.hero.heading)}</title>
    <link rel="stylesheet" href="/assets/landing.css">
  </head>
  <body>
    <a class="skip-link" href="#main">${escapeHtml(common.skipToContent)}</a>
    <header class="site-header">
      <div class="container site-header-inner">
        <a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span>${escapeHtml(strings.navigation.brand)}</a>
        <nav class="site-nav" aria-label="${escapeHtml(strings.navigation.ariaLabel)}">
          <a href="/developers">${escapeHtml(strings.navigation.developers)}</a>
          ${documentationNav}
          <a href="${SOURCE_URL}">${escapeHtml(strings.navigation.github)}</a>
        </nav>
      </div>
    </header>

    <main id="main">
      <div class="container">
        <section class="landing-hero" aria-labelledby="hero-heading">
          <h1 id="hero-heading">${escapeHtml(strings.hero.heading)}</h1>
          <p class="lead">${escapeHtml(strings.hero.lead)}</p>
          <div class="button-row">
            <a class="button" href="/developers">${escapeHtml(strings.hero.consoleAction)}</a>
            ${secondaryAction}
          </div>
        </section>

        <section class="landing-section" aria-labelledby="quickstart-heading">
          <h2 id="quickstart-heading">${escapeHtml(strings.quickstart.heading)}</h2>
          <p>${escapeHtml(strings.quickstart.text)}</p>
          <pre class="code-block"><code>${escapeHtml(strings.quickstart.code)}</code></pre>
          <h3>${escapeHtml(strings.quickstart.exchangeHeading)}</h3>
          <pre class="code-block"><code>${escapeHtml(strings.quickstart.exchangeCode)}</code></pre>
        </section>

        <section class="landing-section" aria-labelledby="flow-heading">
          <h2 id="flow-heading">${escapeHtml(strings.flow.heading)}</h2>
          <ol class="flow-list">
          ${flowItems}
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
          </dl>
        </section>

        <section class="landing-section" aria-labelledby="claims-heading">
          <h2 id="claims-heading">${escapeHtml(strings.claims.heading)}</h2>
          <div class="table-wrap">
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
          ${claimRows}
              </tbody>
            </table>
          </div>
          <h3>${escapeHtml(strings.claims.scopesHeading)}</h3>
          <dl class="summary-list">
          ${scopeItems}
          </dl>
        </section>

        <section class="landing-section" aria-labelledby="endpoints-heading">
          <h2 id="endpoints-heading">${escapeHtml(strings.endpoints.heading)}</h2>
          <ul class="endpoint-list">
          ${endpoints}
          </ul>
        </section>

        <section class="landing-section" aria-labelledby="security-heading">
          <h2 id="security-heading">${escapeHtml(strings.security.heading)}</h2>
          <p>${escapeHtml(strings.security.text)}</p>
        </section>
      </div>
    </main>

    <footer class="site-footer">
      <div class="container">
        <p>${escapeHtml(strings.navigation.brand)} · ${escapeHtml(strings.footer.license)}</p>
        <p>${escapeHtml(strings.affiliation)}</p>
      </div>
    </footer>
  </body>
</html>`;
}
