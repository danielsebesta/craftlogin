import { english } from '../locales/en.js';
import { escapeHtml } from './html.js';

const SOURCE_URL = 'https://github.com/danielsebesta/craftlogin';

export interface LandingPageInput {
  readonly showDocumentation: boolean;
}

export function renderLandingPage(input: LandingPageInput): string {
  const strings = english.landing;
  const documentationLink = input.showDocumentation
    ? `<a href="/docs/">${escapeHtml(strings.navigation.documentation)}</a>`
    : '';
  const primaryAction = input.showDocumentation
    ? `<a class="button" href="/docs/">${escapeHtml(strings.hero.documentationAction)}</a>`
    : `<a class="button" href="${SOURCE_URL}">${escapeHtml(strings.hero.githubAction)}</a>`;
  const secondaryAction = input.showDocumentation
    ? `<a class="button button-secondary" href="${SOURCE_URL}">${escapeHtml(strings.hero.githubAction)}</a>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="theme-color" content="#246b45">
    <meta name="description" content="${escapeHtml(strings.hero.lead)}">
    <title>${escapeHtml(strings.navigation.brand)} · ${escapeHtml(strings.hero.heading)}</title>
    <link rel="stylesheet" href="/assets/landing.css">
  </head>
  <body>
    <header class="navbar">
      <div class="container">
        <a class="brand" href="/" aria-label="${escapeHtml(strings.navigation.brand)}">
          <span class="brand-mark" aria-hidden="true"></span>
          ${escapeHtml(strings.navigation.brand)}
        </a>
        <nav class="navigation" aria-label="${escapeHtml(strings.navigation.ariaLabel)}">
          <a href="/developers">${escapeHtml(strings.navigation.developers)}</a>
          ${documentationLink}
          <a href="${SOURCE_URL}">${escapeHtml(strings.navigation.github)}</a>
        </nav>
      </div>
    </header>

    <main>
      <section class="hero" aria-labelledby="hero-heading">
        <div class="container hero-grid">
          <div>
            <p class="eyebrow">${escapeHtml(strings.hero.eyebrow)}</p>
            <h1 id="hero-heading">${escapeHtml(strings.hero.heading)}</h1>
            <p class="hero-lead">${escapeHtml(strings.hero.lead)}</p>
            <div class="actions">
              ${primaryAction}
              ${secondaryAction}
            </div>
          </div>

          <aside class="example-card" aria-label="${escapeHtml(strings.example.ariaLabel)}">
            <div class="example-header">
              <span class="window-dots" aria-hidden="true"><span></span><span></span><span></span></span>
              <span class="protocol">${escapeHtml(strings.protocol)}</span>
            </div>
            <div class="example-body">
              <div class="example-block">
                <span class="example-label">${escapeHtml(strings.example.addressLabel)}</span>
                <code class="server-address">${escapeHtml(strings.example.address)}</code>
              </div>
              <div class="example-block">
                <span class="example-label">${escapeHtml(strings.example.claimLabel)}</span>
                <code class="claim-value">${escapeHtml(strings.example.claimValue)}</code>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section class="how-it-works" aria-labelledby="steps-heading">
        <div class="container">
          <h2 class="section-heading" id="steps-heading">${escapeHtml(strings.steps.heading)}</h2>
          <ol class="step-grid">
            ${strings.steps.items
              .map(
                (step): string => `<li class="step-card">
              <h3>${escapeHtml(step.title)}</h3>
              <p>${escapeHtml(step.detail)}</p>
            </li>`,
              )
              .join('\n            ')}
          </ol>
        </div>
      </section>

      <div class="container">
        <section class="summary" aria-labelledby="summary-heading">
          <h2 id="summary-heading">${escapeHtml(strings.summary.heading)}</h2>
          <p>${escapeHtml(strings.summary.text)}</p>
        </section>
      </div>
    </main>

    <footer class="footer">
      <div class="container">
        <p>${escapeHtml(strings.navigation.brand)} · ${escapeHtml(strings.footer.license)}</p>
        <p>${escapeHtml(strings.affiliation)}</p>
      </div>
    </footer>
  </body>
</html>`;
}
