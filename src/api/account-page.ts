import { english } from '../locales/en.js';
import { escapeHtml } from './html.js';
import { renderPageDocument } from './ui/document.js';
import { renderIcon } from './ui/icons.js';
import { renderOAuthErrorPage } from './ui/oauth-error-page.js';
import { siteHeader } from './ui/site-chrome.js';
import { renderVerificationBadge } from './ui/verification-badge.js';

export type AccountPageNotice = 'revoked';

export interface ConnectedServiceView {
  readonly clientId: string;
  readonly iconUrl?: string;
  readonly name: string;
  readonly revokeToken: string;
  readonly scopes: readonly string[];
  readonly sessionCount: number;
  readonly signedInAtSeconds?: number;
  readonly validUntil: Date;
  readonly verified: boolean;
}

export interface AccountPageInput {
  readonly accountUuid: string;
  readonly deleteToken: string;
  readonly notice?: AccountPageNotice;
  readonly services: readonly ConnectedServiceView[];
  readonly signedInAtSeconds: number;
  readonly username?: string;
}

export function renderAccountPage(input: AccountPageInput): string {
  const strings = english.account;
  const notice =
    input.notice === 'revoked'
      ? `      <p class="notice" role="status">${escapeHtml(strings.revokedNotice)}</p>\n`
      : '';
  const usernameRow =
    input.username === undefined
      ? ''
      : `<div>
              <dt>${escapeHtml(strings.usernameLabel)}</dt>
              <dd><bdi>${escapeHtml(input.username)}</bdi></dd>
            </div>`;
  const signedIn = formatUtc(new Date(input.signedInAtSeconds * 1_000));

  return renderPageDocument({
    content: `      <header class="console-intro">
        <h1 class="icon-heading">${renderIcon('user', 'heading-icon')}${escapeHtml(strings.heading)}</h1>
        <p class="lead">${escapeHtml(strings.lead)}</p>
      </header>
${notice}      <div class="account-sections">
        <section class="card console-section" aria-labelledby="account-identity-heading">
          <div class="console-section-head">
            <h2 class="icon-heading" id="account-identity-heading">${renderIcon('user', 'heading-icon')}${escapeHtml(strings.identityHeading)}</h2>
          </div>
          <div class="account-identity">
            <img class="account-identity-avatar" src="/api/avatars/${encodeURIComponent(input.accountUuid)}/face?size=64&amp;layers=all" alt="" width="48" height="48" decoding="async">
            <dl class="summary-list">
              ${usernameRow}
              <div>
                <dt>${escapeHtml(strings.uuidLabel)}</dt>
                <dd><code>${escapeHtml(input.accountUuid)}</code></dd>
              </div>
              <div>
                <dt>${escapeHtml(strings.signedInSinceLabel)}</dt>
                <dd><time datetime="${signedIn.iso}">${escapeHtml(signedIn.display)} UTC</time></dd>
              </div>
            </dl>
          </div>
        </section>
        <section class="card console-section" aria-labelledby="account-services-heading">
          <div class="console-section-head">
            <h2 class="icon-heading" id="account-services-heading">${renderIcon('key', 'heading-icon')}${escapeHtml(strings.connectedHeading)}</h2>
          </div>
          ${renderServiceList(input.services)}
          <p class="field-hint">${escapeHtml(strings.durableNote)}</p>
        </section>
        <section class="card console-section" aria-labelledby="account-delete-heading">
          <div class="console-section-head">
            <h2 class="icon-heading" id="account-delete-heading">${renderIcon('logout', 'heading-icon')}${escapeHtml(strings.deleteHeading)}</h2>
          </div>
          <p class="field-hint">${escapeHtml(strings.deleteLead)}</p>
          <form action="/account/delete" method="post">
            <input type="hidden" name="token" value="${escapeHtml(input.deleteToken)}">
            <button class="button button-quiet button-danger-quiet" type="submit">${escapeHtml(strings.deleteAction)}</button>
          </form>
        </section>
      </div>`,
    description: strings.lead,
    header: siteHeader('/account'),
    layout: 'wide',
    mainClass: 'container console-main',
    stylesheet: '/assets/developer.css',
    title: strings.title,
  });
}

export function renderAccountSignedOutPage(): string {
  const strings = english.account.notSignedIn;
  return renderOAuthErrorPage({
    action: { href: '/', kind: 'link', label: strings.homeAction },
    brand: english.interaction.brand,
    footer: english.interaction.footer,
    heading: strings.heading,
    lead: strings.lead,
    title: strings.title,
  });
}

function renderServiceList(services: readonly ConnectedServiceView[]): string {
  const strings = english.account;
  if (services.length === 0) {
    return `<p class="empty-state">${escapeHtml(strings.emptyConnected)}</p>`;
  }
  const cards = services.map((service): string => renderServiceCard(service)).join('\n        ');
  return `<ul class="app-grid">
        ${cards}
      </ul>`;
}

function renderServiceCard(service: ConnectedServiceView): string {
  const strings = english.account;
  const icon =
    service.iconUrl === undefined
      ? ''
      : `<img class="app-card-icon" src="${escapeHtml(service.iconUrl)}" alt="" width="32" height="32" decoding="async">`;
  const badge = service.verified
    ? renderVerificationBadge({
        kind: 'app',
        label: strings.verifiedBadge,
        state: 'verified',
      })
    : '';
  const signedInRow =
    service.signedInAtSeconds === undefined
      ? ''
      : ((): string => {
          const signedIn = formatUtc(new Date(service.signedInAtSeconds * 1_000));
          return `<div>
                <dt>${escapeHtml(strings.signedInLabel)}</dt>
                <dd><time datetime="${signedIn.iso}">${escapeHtml(signedIn.display)} UTC</time></dd>
              </div>`;
        })();
  const validUntil = formatUtc(service.validUntil);
  const sessionsRow =
    service.sessionCount < 2
      ? ''
      : `<div>
                <dt>${escapeHtml(strings.sessionsLabel)}</dt>
                <dd>${escapeHtml(service.sessionCount.toString())}</dd>
              </div>`;
  const scopesRow =
    service.scopes.length === 0
      ? ''
      : `<div>
                <dt>${escapeHtml(strings.scopesLabel)}</dt>
                <dd><ul class="scope-tags">${service.scopes.map((scope): string => `<li><code>${escapeHtml(scope)}</code></li>`).join('')}</ul></dd>
              </div>`;

  return `<li class="card card-flush app-card">
          <article>
            <header class="app-card-header">
              <div class="app-card-identity">
                ${icon}
                <div>
                  <h3 class="app-name">${escapeHtml(service.name)}${badge}</h3>
                  <p class="app-meta"><code>${escapeHtml(service.clientId)}</code></p>
                </div>
              </div>
            </header>
            <dl class="app-card-details">
              ${signedInRow}
              <div>
                <dt>${escapeHtml(strings.validUntilLabel)}</dt>
                <dd><time datetime="${validUntil.iso}">${escapeHtml(validUntil.display)} UTC</time></dd>
              </div>
              ${sessionsRow}
              ${scopesRow}
            </dl>
            <footer class="app-card-actions">
              <form class="row-action-form" action="/account/revoke" method="post">
                <input type="hidden" name="client" value="${escapeHtml(service.clientId)}">
                <input type="hidden" name="token" value="${escapeHtml(service.revokeToken)}">
                <button class="button button-quiet button-danger-quiet" type="submit">${renderIcon('logout', 'button-icon')}${escapeHtml(strings.revokeAction)}</button>
              </form>
            </footer>
          </article>
        </li>`;
}

function formatUtc(date: Date): { readonly display: string; readonly iso: string } {
  const iso = date.toISOString();
  return { display: iso.replace('T', ' ').slice(0, 16), iso };
}
