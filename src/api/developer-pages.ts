import type { DeveloperAccess, DeveloperRole } from '../developers/developer-repository.js';
import type { ManagedApp } from '../developers/app-management.js';
import type { DeveloperLoginAttempt } from '../developers/login-service.js';
import { english } from '../locales/en.js';
import type { RegisteredApp } from './app-registration.js';
import { escapeHtml } from './html.js';

const MAXIMUM_POLL_ATTEMPTS = 48;

export interface DeveloperDashboardInput {
  readonly apps: readonly ManagedApp[];
  readonly csrfToken: string;
  readonly developers?: readonly DeveloperAccess[];
  readonly notice?: 'last-admin';
  readonly role: DeveloperRole;
  readonly userUuid: string;
}

export function renderDeveloperLoginPage(
  attempt: DeveloperLoginAttempt,
  minecraftBaseDomain: string,
): string {
  const strings = english.developer;
  const interaction = english.interaction;
  const address =
    attempt.code === null
      ? attempt.status === 'verified'
        ? strings.login.verifiedAddress
        : strings.login.addressPending
      : `${attempt.code}.${minecraftBaseDomain}`;
  const initialStatus =
    attempt.status === 'verified' ? interaction.status.verified : interaction.status.pending;

  return pageShell(
    `${strings.navigation.console} · ${interaction.title}`,
    `<main
      class="developer-login"
      data-verification
      data-status-url="/developers/login/status"
      data-maximum-attempts="${MAXIMUM_POLL_ATTEMPTS.toString()}"
      data-pending-message="${escapeHtml(interaction.status.pending)}"
      data-verified-message="${escapeHtml(interaction.status.verified)}"
      data-expired-message="${escapeHtml(interaction.status.expired)}"
      data-network-message="${escapeHtml(interaction.status.networkError)}"
      data-stopped-message="${escapeHtml(interaction.status.stopped)}"
    >
      <section class="login-manifest" aria-labelledby="developer-login-heading">
        <p class="kicker">${escapeHtml(strings.login.eyebrow)}</p>
        <h1 id="developer-login-heading">${escapeHtml(strings.login.heading)}</h1>
        <p class="intro">${escapeHtml(strings.login.intro)}</p>
        <ol class="login-steps">
          ${interaction.steps.map((step): string => `<li>${escapeHtml(step)}</li>`).join('\n          ')}
        </ol>
      </section>
      <section class="login-terminal" aria-labelledby="developer-address-heading">
        <p class="terminal-label" id="developer-address-heading">${escapeHtml(interaction.addressLabel)}</p>
        <code class="login-address">${escapeHtml(address)}</code>
        <div class="login-status">
          <span>${escapeHtml(interaction.statusLabel)}</span>
          <p data-status-message data-state="${escapeHtml(attempt.status)}" role="status" aria-live="polite">${escapeHtml(initialStatus)}</p>
        </div>
        <form action="/developers/login/complete" method="post">
          <button class="primary-action" type="submit">${escapeHtml(interaction.continueButton)}</button>
        </form>
        <noscript><p class="noscript-note">${escapeHtml(interaction.noJavaScript)}</p></noscript>
      </section>
    </main>`,
    true,
  );
}

export function renderDeveloperAccessDeniedPage(): string {
  const strings = english.developer;
  return pageShell(
    strings.accessDenied.title,
    `<main class="message-layout">
      <section class="message-card message-card-denied" aria-labelledby="denied-heading">
        <p class="kicker">403 · ${escapeHtml(strings.navigation.console)}</p>
        <h1 id="denied-heading">${escapeHtml(strings.accessDenied.heading)}</h1>
        <p class="intro">${escapeHtml(strings.accessDenied.detail)}</p>
        <a class="primary-action inline-action" href="/developers/login">${escapeHtml(strings.accessDenied.retry)}</a>
      </section>
    </main>`,
    false,
  );
}

export function renderDeveloperDashboard(input: DeveloperDashboardInput): string {
  const strings = english.developer;
  const roleLabel =
    input.role === 'admin' ? strings.dashboard.adminBadge : strings.dashboard.developerBadge;
  const adminPanel =
    input.role === 'admin' && input.developers !== undefined
      ? renderAdministratorPanel(input.developers, input.csrfToken, input.notice)
      : '';

  return pageShell(
    strings.navigation.console,
    `<main class="console-main">
      <header class="console-hero">
        <div>
          <p class="kicker">${escapeHtml(strings.dashboard.eyebrow)}</p>
          <h1>${escapeHtml(strings.dashboard.heading)}</h1>
          <p class="intro">${escapeHtml(strings.dashboard.intro)}</p>
        </div>
        <aside class="identity-ticket" aria-label="${escapeHtml(strings.dashboard.uuidLabel)}">
          <span class="role-stamp">${escapeHtml(roleLabel)}</span>
          <span>${escapeHtml(strings.dashboard.uuidLabel)}</span>
          <code>${escapeHtml(input.userUuid)}</code>
          <form action="/developers/logout" method="post">
            ${csrfField(input.csrfToken)}
            <button class="text-action" type="submit">${escapeHtml(strings.dashboard.logout)}</button>
          </form>
        </aside>
      </header>

      <div class="console-grid">
        <section class="panel app-register" aria-labelledby="register-heading">
          <p class="panel-index">${escapeHtml(strings.app.registerSectionLabel)}</p>
          <h2 id="register-heading">${escapeHtml(strings.app.newHeading)}</h2>
          ${renderRegistrationForm(input.csrfToken)}
        </section>

        <section class="panel app-directory" aria-labelledby="apps-heading">
          <p class="panel-index">${escapeHtml(strings.app.clientsSectionLabel)}</p>
          <h2 id="apps-heading">${escapeHtml(strings.app.heading)}</h2>
          ${renderAppList(input.apps, input.csrfToken, input.role)}
        </section>
      </div>
      ${adminPanel}
    </main>`,
    false,
  );
}

export function renderCreatedAppPage(app: RegisteredApp): string {
  const strings = english.developer;
  const secret =
    app.clientSecret === undefined
      ? ''
      : `<div class="credential credential-secret">
          <span>${escapeHtml(strings.app.secretLabel)}</span>
          <code>${escapeHtml(app.clientSecret)}</code>
        </div>`;

  return pageShell(
    strings.app.createdTitle,
    `<main class="message-layout">
      <section class="message-card credential-card" aria-labelledby="created-heading">
        <p class="kicker">201 · ${escapeHtml(app.clientType === 'public' ? strings.app.publicLabel : strings.app.confidentialLabel)}</p>
        <h1 id="created-heading">${escapeHtml(strings.app.createdHeading)}</h1>
        <p class="intro">${escapeHtml(strings.app.createdIntro)}</p>
        <div class="credential">
          <span>${escapeHtml(strings.app.clientIdLabel)}</span>
          <code>${escapeHtml(app.clientId)}</code>
        </div>
        ${secret}
        <form action="/developers" method="get">
          <button class="primary-action" type="submit">${escapeHtml(strings.navigation.console)}</button>
        </form>
      </section>
    </main>`,
    false,
  );
}

function renderRegistrationForm(csrfToken: string): string {
  const strings = english.developer.app;
  return `<form class="stack-form" action="/developers/apps" method="post">
    ${csrfField(csrfToken)}
    <label>
      <span>${escapeHtml(strings.nameLabel)}</span>
      <input name="name" required maxlength="100" autocomplete="off" placeholder="${escapeHtml(strings.namePlaceholder)}">
    </label>
    <fieldset>
      <legend>${escapeHtml(strings.typeLabel)}</legend>
      <label class="choice-row">
        <input type="radio" name="clientType" value="public" checked>
        <span><strong>${escapeHtml(strings.publicLabel)}</strong><small>${escapeHtml(strings.publicHelp)}</small></span>
      </label>
      <label class="choice-row">
        <input type="radio" name="clientType" value="confidential">
        <span><strong>${escapeHtml(strings.confidentialLabel)}</strong><small>${escapeHtml(strings.confidentialHelp)}</small></span>
      </label>
    </fieldset>
    <label>
      <span>${escapeHtml(strings.redirectLabel)}</span>
      <textarea name="redirectUris" required rows="4" spellcheck="false" placeholder="${escapeHtml(strings.redirectPlaceholder)}"></textarea>
      <small>${escapeHtml(strings.redirectHelp)}</small>
    </label>
    <button class="primary-action" type="submit">${escapeHtml(strings.createAction)}</button>
  </form>`;
}

function renderAppList(
  apps: readonly ManagedApp[],
  csrfToken: string,
  role: DeveloperRole,
): string {
  const strings = english.developer.app;
  if (apps.length === 0) {
    return `<p class="empty-state">${escapeHtml(strings.empty)}</p>`;
  }

  return `<div class="app-list">${apps
    .map(
      (app): string => `<article class="app-row">
        <div class="app-heading">
          <div><span class="client-type">${escapeHtml(app.clientType === 'public' ? strings.publicLabel : strings.confidentialLabel)}</span><h3>${escapeHtml(app.name)}</h3></div>
          <form action="/developers/apps/${encodeURIComponent(app.id)}/delete" method="post">
            ${csrfField(csrfToken)}
            <button class="danger-action" type="submit">${escapeHtml(strings.deleteAction)}</button>
          </form>
        </div>
        <dl>
          <div><dt>${escapeHtml(strings.clientIdLabel)}</dt><dd><code>${escapeHtml(app.clientId)}</code></dd></div>
          ${
            role === 'admin'
              ? `<div><dt>${escapeHtml(strings.ownerLabel)}</dt><dd><code>${escapeHtml(app.ownerUuid ?? strings.unassignedOwner)}</code></dd></div>`
              : ''
          }
          <div><dt>${escapeHtml(strings.redirectLabel)}</dt><dd>${app.redirectUris
            .map((uri): string => `<code>${escapeHtml(uri)}</code>`)
            .join('')}</dd></div>
        </dl>
      </article>`,
    )
    .join('')}</div>`;
}

function renderAdministratorPanel(
  developers: readonly DeveloperAccess[],
  csrfToken: string,
  notice: 'last-admin' | undefined,
): string {
  const strings = english.developer.admin;
  const noticeMarkup =
    notice === 'last-admin'
      ? `<p class="notice" role="status">${escapeHtml(strings.lastAdminNotice)}</p>`
      : '';
  const entries =
    developers.length === 0
      ? `<p class="empty-state">${escapeHtml(strings.empty)}</p>`
      : `<div class="access-list">${developers
          .map((developer): string => renderDeveloperEntry(developer, csrfToken))
          .join('')}</div>`;

  return `<section class="panel admin-panel" aria-labelledby="admin-heading">
    <p class="panel-index">${escapeHtml(strings.sectionLabel)}</p>
    <div class="admin-heading"><div><h2 id="admin-heading">${escapeHtml(strings.heading)}</h2><p>${escapeHtml(strings.intro)}</p></div></div>
    ${noticeMarkup}
    <form class="admin-grant-form" action="/developers/admin/developers" method="post">
      ${csrfField(csrfToken)}
      <label><span>${escapeHtml(strings.uuidLabel)}</span><input name="uuid" required autocomplete="off" pattern="[0-9a-fA-F-]{36}" placeholder="${escapeHtml(strings.uuidPlaceholder)}"></label>
      <label><span>${escapeHtml(strings.roleLabel)}</span><select name="role"><option value="developer">${escapeHtml(strings.developerRole)}</option><option value="admin">${escapeHtml(strings.adminRole)}</option></select></label>
      <button class="primary-action" type="submit">${escapeHtml(strings.addAction)}</button>
    </form>
    ${entries}
  </section>`;
}

function renderDeveloperEntry(developer: DeveloperAccess, csrfToken: string): string {
  const strings = english.developer.admin;
  return `<article class="access-row">
    <div><code>${escapeHtml(developer.uuid)}</code><small>${escapeHtml(strings.createdLabel)} <time datetime="${escapeHtml(developer.createdAt)}">${escapeHtml(developer.createdAt.slice(0, 10))}</time></small></div>
    <form action="/developers/admin/developers" method="post">
      ${csrfField(csrfToken)}
      <input type="hidden" name="uuid" value="${escapeHtml(developer.uuid)}">
      <label class="compact-label"><span>${escapeHtml(strings.roleLabel)}</span><select name="role"><option value="developer"${developer.role === 'developer' ? ' selected' : ''}>${escapeHtml(strings.developerRole)}</option><option value="admin"${developer.role === 'admin' ? ' selected' : ''}>${escapeHtml(strings.adminRole)}</option></select></label>
      <button class="secondary-action" type="submit">${escapeHtml(strings.saveRoleAction)}</button>
    </form>
    <form action="/developers/admin/developers/${encodeURIComponent(developer.uuid)}/delete" method="post">
      ${csrfField(csrfToken)}
      <button class="danger-action" type="submit">${escapeHtml(strings.removeAction)}</button>
    </form>
  </article>`;
}

function csrfField(token: string): string {
  return `<input type="hidden" name="csrfToken" value="${escapeHtml(token)}">`;
}

function pageShell(title: string, content: string, includePollingScript: boolean): string {
  const strings = english.developer;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark light">
    <meta name="theme-color" content="#122019">
    <title>${escapeHtml(title)} · ${escapeHtml(strings.navigation.brand)}</title>
    <link rel="stylesheet" href="/assets/developer.css">
    ${includePollingScript ? '<script src="/assets/interaction.js" defer></script>' : ''}
  </head>
  <body>
    <header class="developer-nav">
      <a class="developer-brand" href="/"><span aria-hidden="true"></span>${escapeHtml(strings.navigation.brand)}</a>
      <nav aria-label="${escapeHtml(strings.navigation.ariaLabel)}"><a href="/">${escapeHtml(strings.navigation.home)}</a><strong>${escapeHtml(strings.navigation.console)}</strong></nav>
    </header>
    ${content}
    <footer class="developer-footer">${escapeHtml(strings.footer)}</footer>
  </body>
</html>`;
}
