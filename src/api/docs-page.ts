import { english } from '../locales/en.js';
import { escapeHtml } from './html.js';
import { renderPageDocument } from './ui/document.js';
import { renderIcon } from './ui/icons.js';
import { selectDemoPlayer, formatShowcaseCaption, type DemoPlayer } from './demo-players.js';
import { siteFooter, siteHeader } from './ui/site-chrome.js';

const SHOWCASE_SOURCE_URL = 'https://paperboat.yt/';

export interface DocsPageInput {
  readonly demoPlayer?: DemoPlayer;
}
const DOCS_NAVIGATION_ICONS = [
  'code',
  'login',
  'user',
  'key',
  'server',
  'gamepad',
  'shield',
] as const;
const QUICKSTART_ICONS = ['briefcase', 'link', 'user'] as const;

function codeBlock(code: string, label: string): string {
  return `<pre class="code-block docs-code" tabindex="0" aria-label="${escapeHtml(label)}"><code>${escapeHtml(code)}</code></pre>`;
}

function renderEndpointTable(
  endpoints: readonly { readonly detail: string; readonly method: string; readonly path: string }[],
): string {
  const strings = english.docs.api;
  return `<div class="table-wrap">
              <table class="table docs-endpoints">
                <thead>
                  <tr>
                    <th scope="col">${escapeHtml(strings.methodHeading)}</th>
                    <th scope="col">${escapeHtml(strings.endpointHeading)}</th>
                    <th scope="col">${escapeHtml(strings.purposeHeading)}</th>
                  </tr>
                </thead>
                <tbody>
${endpoints
  .map(
    (endpoint): string => `                  <tr>
                    <td><span class="method">${escapeHtml(endpoint.method)}</span></td>
                    <th scope="row"><code>${escapeHtml(endpoint.path)}</code></th>
                    <td>${escapeHtml(endpoint.detail)}</td>
                  </tr>`,
  )
  .join('\n')}
                </tbody>
              </table>
            </div>`;
}

export function renderDocsPage(input: DocsPageInput = {}): string {
  const strings = english.docs;
  const demoPlayer = input.demoPlayer ?? selectDemoPlayer();

  return renderPageDocument({
    content: `      <aside class="docs-rail" aria-labelledby="docs-navigation-heading">
        <nav class="docs-toc" aria-label="${escapeHtml(strings.tableOfContents.heading)}">
          <h2 id="docs-navigation-heading">${escapeHtml(strings.tableOfContents.heading)}</h2>
          <ol>
${strings.tableOfContents.items
  .map(
    (item, index): string =>
      `            <li><a href="${escapeHtml(item.href)}">${renderIcon(DOCS_NAVIGATION_ICONS[index] ?? 'bookOpen', 'nav-icon')}${escapeHtml(item.label)}</a></li>`,
  )
  .join('\n')}
          </ol>
        </nav>
      </aside>
      <article class="docs-content">
        <h1 class="docs-title">${escapeHtml(strings.title)}</h1>
        <p class="section-intro">${escapeHtml(strings.description)}</p>
        <section class="docs-section" id="quickstart" aria-labelledby="quickstart-heading">
          <h2 class="icon-heading" id="quickstart-heading">${renderIcon('code', 'heading-icon')}${escapeHtml(strings.quickstart.heading)}</h2>
          <p class="section-intro">${escapeHtml(strings.quickstart.intro)}</p>
          <ol class="docs-steps">
${strings.quickstart.steps
  .map(
    (step, index): string => `            <li>
              ${renderIcon(QUICKSTART_ICONS[index] ?? 'check', 'list-icon')}
              <h3>${escapeHtml(step.title)}</h3>
              <p>${escapeHtml(step.detail)}</p>
            </li>`,
  )
  .join('\n')}
          </ol>
          <h3>${escapeHtml(strings.quickstart.configurationHeading)}</h3>
          ${codeBlock(strings.quickstart.configurationCode, strings.quickstart.configurationHeading)}
          <p class="docs-callout">${escapeHtml(strings.quickstart.libraryNotice)}</p>
        </section>

        <section class="docs-section" id="flow" aria-labelledby="flow-heading">
          <h2 class="icon-heading" id="flow-heading">${renderIcon('login', 'heading-icon')}${escapeHtml(strings.flow.heading)}</h2>
          <p class="section-intro">${escapeHtml(strings.flow.intro)}</p>
          <div class="flow-block">
            <h3>${escapeHtml(strings.flow.authorizeHeading)}</h3>
            ${codeBlock(strings.flow.authorizeCode, strings.flow.authorizeHeading)}
          </div>
          <div class="flow-block">
            <h3>${escapeHtml(strings.flow.callbackHeading)}</h3>
            <p>${escapeHtml(strings.flow.callbackText)}</p>
          </div>
          <div class="flow-block">
            <h3>${escapeHtml(strings.flow.tokenHeading)}</h3>
            ${codeBlock(strings.flow.tokenCode, strings.flow.tokenHeading)}
          </div>
          <p class="docs-callout">${escapeHtml(strings.flow.confidentialNote)}</p>
        </section>

        <section class="docs-section" id="claims" aria-labelledby="claims-heading">
          <h2 class="icon-heading" id="claims-heading">${renderIcon('user', 'heading-icon')}${escapeHtml(strings.claims.heading)}</h2>
          <p class="section-intro">${escapeHtml(strings.claims.intro)}</p>
          <div class="docs-columns">
            <div>
              <table class="table docs-definition-table">
                <thead><tr><th scope="col">${escapeHtml(strings.claims.scopeHeading)}</th><th scope="col">${escapeHtml(strings.claims.purposeHeading)}</th></tr></thead>
                <tbody>
${strings.claims.scopes
  .map(
    (scope): string =>
      `                  <tr><th scope="row"><code>${escapeHtml(scope.name)}</code></th><td>${escapeHtml(scope.detail)}</td></tr>`,
  )
  .join('\n')}
                </tbody>
              </table>
            </div>
            <div>
              <table class="table docs-definition-table">
                <thead><tr><th scope="col">${escapeHtml(strings.claims.claimHeading)}</th><th scope="col">${escapeHtml(strings.claims.valueHeading)}</th></tr></thead>
                <tbody>
${strings.claims.claims
  .map(
    (claim): string =>
      `                  <tr><th scope="row"><code>${escapeHtml(claim.name)}</code></th><td>${escapeHtml(claim.detail)}</td></tr>`,
  )
  .join('\n')}
                </tbody>
              </table>
            </div>
          </div>
          <h3>${escapeHtml(strings.claims.exampleHeading)}</h3>
          ${codeBlock(strings.claims.exampleCode, strings.claims.exampleHeading)}
        </section>

        <section class="docs-section" id="sessions" aria-labelledby="sessions-heading">
          <h2 class="icon-heading" id="sessions-heading">${renderIcon('key', 'heading-icon')}${escapeHtml(strings.sessions.heading)}</h2>
          <p class="section-intro">${escapeHtml(strings.sessions.intro)}</p>
          <dl class="docs-topics">
${strings.sessions.items
  .map(
    (item): string =>
      `            <div><dt>${escapeHtml(item.title)}</dt><dd>${escapeHtml(item.detail)}</dd></div>`,
  )
  .join('\n')}
          </dl>
        </section>

        <section class="docs-section" id="api" aria-labelledby="api-heading">
          <h2 class="icon-heading" id="api-heading">${renderIcon('server', 'heading-icon')}${escapeHtml(strings.api.heading)}</h2>
          <p class="section-intro">${escapeHtml(strings.api.intro)}</p>
${strings.api.groups
  .map(
    (
      group,
      index,
    ): string => `          <h3 class="icon-heading">${renderIcon(index === 0 ? 'link' : 'users', 'heading-icon')}${escapeHtml(group.heading)}</h3>
          ${renderEndpointTable(group.endpoints)}`,
  )
  .join('\n')}
          <p class="docs-reference-link">${escapeHtml(strings.api.openApiText)} <a href="/openapi.yaml">${escapeHtml(strings.api.openApiAction)}</a></p>
        </section>

        <section class="docs-section" id="avatars" aria-labelledby="avatars-heading">
          <h2 class="icon-heading" id="avatars-heading">${renderIcon('gamepad', 'heading-icon')}${escapeHtml(strings.avatars.heading)}</h2>
          <p class="section-intro">${escapeHtml(strings.avatars.intro)}</p>
          <div class="avatar-docs">
            <img src="/api/avatars/${demoPlayer.uuid}/bust?size=256&amp;layers=all" alt="${escapeHtml(strings.avatars.exampleAlt)}" width="256" height="256" loading="lazy" decoding="async">
            <div>
              ${codeBlock(strings.avatars.template, strings.avatars.heading)}
              <dl class="summary-list">
${strings.avatars.parameters
  .map(
    (parameter): string =>
      `                <div><dt><code>${escapeHtml(parameter.name)}</code></dt><dd>${escapeHtml(parameter.detail)}</dd></div>`,
  )
  .join('\n')}
              </dl>
              <p class="avatar-credit">${escapeHtml(formatShowcaseCaption(strings.avatars.showcaseCaption, demoPlayer))} <a href="${SHOWCASE_SOURCE_URL}">${escapeHtml(strings.avatars.showcaseSourceLabel)}</a></p>
            </div>
          </div>
        </section>

        <section class="docs-section" id="security" aria-labelledby="security-heading">
          <h2 class="icon-heading" id="security-heading">${renderIcon('shield', 'heading-icon')}${escapeHtml(strings.security.heading)}</h2>
          <p class="section-intro">${escapeHtml(strings.security.intro)}</p>
          <ol class="security-list">
${strings.security.items
  .map(
    (item): string =>
      `            <li>${renderIcon('check', 'list-icon')}<span>${escapeHtml(item)}</span></li>`,
  )
  .join('\n')}
          </ol>
        </section>
      </article>`,
    description: strings.description,
    footer: siteFooter(),
    header: siteHeader('/docs/'),
    mainClass: 'docs-shell',
    stylesheet: '/assets/docs.css',
    title: strings.title,
  });
}
