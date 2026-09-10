import type { DeveloperAccess, DeveloperRole } from '../developers/developer-repository.js';
import type { ManagedApp } from '../developers/app-management.js';
import type { DeveloperLoginAttempt } from '../developers/login-service.js';
import { english } from '../locales/en.js';
import type { RegisteredApp } from './app-registration.js';
import { escapeHtml } from './html.js';
import { renderSignInPage } from './ui/sign-in-page.js';

export type DashboardNotice = 'invalid-form' | 'last-admin' | 'not-found';

export interface DeveloperDashboardInput {
  readonly apps: readonly ManagedApp[];
  readonly csrfToken: string;
  readonly developers?: readonly DeveloperAccess[];
  readonly formError?: string;
  readonly formValues?: {
    readonly clientType: 'confidential' | 'public';
    readonly name: string;
    readonly redirectUris: string;
  };
  readonly notice?: DashboardNotice;
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
  const verified = attempt.status === 'verified';

  return renderSignInPage({
    action: '/developers/login/complete',
    address,
    addressLabel: interaction.addressLabel,
    brand: strings.navigation.brand,
    continueLabel: interaction.continueButton,
    copiedLabel: interaction.copied,
    copyLabel: interaction.copyAddress,
    documentTitle: `${strings.login.documentTitle} · ${strings.navigation.brand}`,
    footer: strings.footer,
    heading: strings.login.heading,
    headingId: 'developer-login-heading',
    initialStatus: verified ? interaction.status.verified : interaction.status.pending,
    initialStatusState: verified ? 'verified' : 'pending',
    lead: strings.login.lead,
    messages: interaction.status,
    noJavaScript: interaction.noJavaScript,
    securityNote: interaction.securityNote,
    skipLabel: english.common.skipToContent,
    statusUrl: '/developers/login/status',
    steps: interaction.steps,
    stepsHeading: interaction.stepsHeading,
  });
}

export function renderDeveloperAccessDeniedPage(): string {
  const strings = english.developer;
  return pageShell(
    strings.accessDenied.title,
    `<main id="main" class="message-layout">
      <section class="message-card card" aria-labelledby="denied-heading">
        <h1 id="denied-heading">${escapeHtml(strings.accessDenied.heading)}</h1>
        <p class="lead">${escapeHtml(strings.accessDenied.detail)}</p>
        <div class="button-row">
          <a class="button" href="/developers/login">${escapeHtml(strings.accessDenied.retry)}</a>
        </div>
      </section>
    </main>`,
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
  const formOpen = input.apps.length === 0 || input.formError !== undefined;
  const formErrorNotice =
    input.formError === undefined
      ? ''
      : `<p class="notice notice-error" role="alert">${escapeHtml(input.formError)}</p>`;
  const dashboardNotice = renderDashboardNotice(input.notice);
  const identity = `<span class="console-identity"><code>${escapeHtml(input.userUuid)}</code><span>${escapeHtml(roleLabel)}</span><form action="/developers/logout" method="post">${csrfField(input.csrfToken)}<button class="button-quiet" type="submit">${escapeHtml(strings.dashboard.logout)}</button></form></span>`;

  return pageShell(
    strings.dashboard.heading,
    `<main id="main" class="container console-main">
      <h1>${escapeHtml(strings.dashboard.heading)}</h1>
      <p class="lead">${escapeHtml(strings.dashboard.lead)}</p>
      ${dashboardNotice}
      <section class="console-section" aria-labelledby="apps-heading">
        <div class="console-section-head">
          <h2 id="apps-heading">${escapeHtml(strings.dashboard.applicationsHeading)}</h2>
          <a href="/docs/">${escapeHtml(strings.dashboard.docsLink)}</a>
        </div>
        ${renderAppTable(input.apps, input.role)}
      </section>

      <details class="disclosure"${formOpen ? ' open' : ''}>
        <summary>${escapeHtml(strings.app.newHeading)}<span class="disclosure-marker" aria-hidden="true"></span></summary>
        <div class="disclosure-body">
          ${formErrorNotice}
          ${renderRegistrationForm(input.csrfToken, input.formValues)}
        </div>
      </details>
      ${adminPanel}
    </main>`,
    { identity },
  );
}

export function renderCreatedAppPage(app: RegisteredApp): string {
  const strings = english.developer;
  const interaction = english.interaction;
  const redirects = app.redirectUris
    .map((uri): string => `<li><code>${escapeHtml(uri)}</code></li>`)
    .join('');
  const secret =
    app.clientSecret === undefined
      ? ''
      : `<div class="credential">
          <p class="field-label">${escapeHtml(strings.app.secretLabel)}</p>
          <code id="client-secret">${escapeHtml(app.clientSecret)}</code>
          <div class="button-row">
            <button type="button" class="button button-secondary" data-copy-target="#client-secret" data-copied-label="${escapeHtml(interaction.copied)}" hidden>${escapeHtml(strings.app.copyLabel)}</button>
          </div>
        </div>`;

  return pageShell(
    strings.app.createdTitle,
    `<main id="main" class="message-layout">
      <section class="message-card card" aria-labelledby="created-heading">
        <h1 id="created-heading">${escapeHtml(strings.app.createdHeading)}</h1>
        <p class="lead">${escapeHtml(strings.app.createdIntro)}</p>
        <dl class="summary-list">
          <div>
            <dt>${escapeHtml(strings.app.nameLabel)}</dt>
            <dd>${escapeHtml(app.name)}</dd>
          </div>
          <div>
            <dt>${escapeHtml(strings.app.clientIdLabel)}</dt>
            <dd><code>${escapeHtml(app.clientId)}</code></dd>
          </div>
          <div>
            <dt>${escapeHtml(strings.app.redirectLabel)}</dt>
            <dd><ul class="redirect-list">${redirects}</ul></dd>
          </div>
        </dl>
        ${secret}
        <div class="button-row">
          <a class="button" href="/developers">${escapeHtml(strings.navigation.console)}</a>
        </div>
      </section>
    </main>`,
    { includeScript: true },
  );
}

export function renderDeleteAppPage(app: ManagedApp, csrfToken: string): string {
  const strings = english.developer;
  return pageShell(
    strings.confirm.appTitle,
    `<main id="main" class="message-layout">
      <section class="message-card card" aria-labelledby="confirm-heading">
        <h1 id="confirm-heading">${escapeHtml(strings.confirm.appHeading)}</h1>
        <p class="lead">${escapeHtml(strings.confirm.appBody)}</p>
        <dl class="summary-list">
          <div>
            <dt>${escapeHtml(strings.app.nameLabel)}</dt>
            <dd>${escapeHtml(app.name)}</dd>
          </div>
          <div>
            <dt>${escapeHtml(strings.app.clientIdLabel)}</dt>
            <dd><code>${escapeHtml(app.clientId)}</code></dd>
          </div>
        </dl>
        <form action="/developers/apps/${encodeURIComponent(app.id)}/delete" method="post">
          ${csrfField(csrfToken)}
          <div class="button-row">
            <button class="button button-danger" type="submit">${escapeHtml(strings.confirm.appAction)}</button>
            <a class="button button-secondary" href="/developers">${escapeHtml(strings.confirm.cancel)}</a>
          </div>
        </form>
      </section>
    </main>`,
  );
}

export function renderRemoveDeveloperPage(developer: DeveloperAccess, csrfToken: string): string {
  const strings = english.developer;
  const roleLabel =
    developer.role === 'admin' ? strings.admin.adminRole : strings.admin.developerRole;
  return pageShell(
    strings.confirm.developerTitle,
    `<main id="main" class="message-layout">
      <section class="message-card card" aria-labelledby="confirm-heading">
        <h1 id="confirm-heading">${escapeHtml(strings.confirm.developerHeading)}</h1>
        <p class="lead">${escapeHtml(strings.confirm.developerBody)}</p>
        <dl class="summary-list">
          <div>
            <dt>${escapeHtml(strings.admin.uuidLabel)}</dt>
            <dd><code>${escapeHtml(developer.uuid)}</code></dd>
          </div>
          <div>
            <dt>${escapeHtml(strings.admin.roleLabel)}</dt>
            <dd>${escapeHtml(roleLabel)}</dd>
          </div>
        </dl>
        <form action="/developers/admin/developers/${encodeURIComponent(developer.uuid)}/delete" method="post">
          ${csrfField(csrfToken)}
          <div class="button-row">
            <button class="button button-danger" type="submit">${escapeHtml(strings.confirm.removeAction)}</button>
            <a class="button button-secondary" href="/developers">${escapeHtml(strings.confirm.cancel)}</a>
          </div>
        </form>
      </section>
    </main>`,
  );
}

function renderDashboardNotice(notice: DashboardNotice | undefined): string {
  const strings = english.developer;
  if (notice === undefined) {
    return '';
  }
  if (notice === 'last-admin') {
    return `<p class="notice" role="status">${escapeHtml(strings.admin.lastAdminNotice)}</p>`;
  }
  if (notice === 'invalid-form') {
    return `<p class="notice notice-error" role="alert">${escapeHtml(strings.admin.invalidFormNotice)}</p>`;
  }
  return `<p class="notice notice-error" role="alert">${escapeHtml(strings.admin.notFoundNotice)}</p>`;
}

function renderAppTable(apps: readonly ManagedApp[], role: DeveloperRole): string {
  const strings = english.developer.app;
  if (apps.length === 0) {
    return `<p class="empty-state">${escapeHtml(strings.empty)}</p>`;
  }

  const rows = apps
    .map((app): string => {
      const redirects = app.redirectUris
        .map((uri): string => `<li><code>${escapeHtml(uri)}</code></li>`)
        .join('');
      const owner =
        role === 'admin'
          ? `<span class="app-type">${escapeHtml(strings.ownerLabel)}: ${escapeHtml(app.ownerUuid ?? strings.unassignedOwner)}</span>`
          : '';
      return `<tr>
        <th scope="row"><span class="app-name">${escapeHtml(app.name)}</span><span class="app-type">${escapeHtml(app.clientType === 'public' ? strings.publicLabel : strings.confidentialLabel)}</span>${owner}</th>
        <td><code>${escapeHtml(app.clientId)}</code></td>
        <td><ul class="redirect-list">${redirects}</ul></td>
        <td class="table-actions"><a class="button button-danger" href="/developers/apps/${encodeURIComponent(app.id)}/delete">${escapeHtml(strings.deleteAction)}</a></td>
      </tr>`;
    })
    .join('\n        ');

  return `<div class="table-wrap">
      <table class="table">
        <caption class="visually-hidden">${escapeHtml(english.developer.dashboard.applicationsHeading)}</caption>
        <thead>
          <tr>
            <th scope="col">${escapeHtml(strings.nameLabel)}</th>
            <th scope="col">${escapeHtml(strings.clientIdLabel)}</th>
            <th scope="col">${escapeHtml(strings.redirectLabel)}</th>
            <th scope="col"><span class="visually-hidden">${escapeHtml(strings.deleteAction)}</span></th>
          </tr>
        </thead>
        <tbody>
        ${rows}
        </tbody>
      </table>
    </div>`;
}

function renderRegistrationForm(
  csrfToken: string,
  values: DeveloperDashboardInput['formValues'],
): string {
  const strings = english.developer.app;
  const clientType = values?.clientType ?? 'public';
  return `<form class="stack" action="/developers/apps" method="post">
    ${csrfField(csrfToken)}
    <div class="field">
      <label for="app-name">${escapeHtml(strings.nameLabel)}</label>
      <input id="app-name" name="name" required maxlength="100" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(strings.namePlaceholder)}…" value="${escapeHtml(values?.name ?? '')}">
    </div>
    <fieldset class="field">
      <legend class="field-label">${escapeHtml(strings.typeLabel)}</legend>
      <div class="choice-group">
        <label class="choice">
          <input type="radio" name="clientType" value="public"${clientType === 'public' ? ' checked' : ''}>
          <span><span class="choice-title">${escapeHtml(strings.publicLabel)}</span><span class="choice-hint">${escapeHtml(strings.publicHelp)}</span></span>
        </label>
        <label class="choice">
          <input type="radio" name="clientType" value="confidential"${clientType === 'confidential' ? ' checked' : ''}>
          <span><span class="choice-title">${escapeHtml(strings.confidentialLabel)}</span><span class="choice-hint">${escapeHtml(strings.confidentialHelp)}</span></span>
        </label>
      </div>
    </fieldset>
    <div class="field">
      <label for="app-redirects">${escapeHtml(strings.redirectLabel)}</label>
      <textarea id="app-redirects" name="redirectUris" required rows="4" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(strings.redirectPlaceholder)}">${escapeHtml(values?.redirectUris ?? '')}</textarea>
      <small class="field-hint">${escapeHtml(strings.redirectHelp)}</small>
    </div>
    <div class="button-row">
      <button class="button" type="submit">${escapeHtml(strings.createAction)}</button>
    </div>
  </form>`;
}

function renderAdministratorPanel(
  developers: readonly DeveloperAccess[],
  csrfToken: string,
  notice: DashboardNotice | undefined,
): string {
  const strings = english.developer;
  const admin = strings.admin;
  const open = notice === 'last-admin' || notice === 'invalid-form' || notice === 'not-found';
  const entries =
    developers.length === 0
      ? `<p class="empty-state">${escapeHtml(admin.empty)}</p>`
      : `<div class="table-wrap">
      <table class="table">
        <caption class="visually-hidden">${escapeHtml(admin.heading)}</caption>
        <thead>
          <tr>
            <th scope="col">${escapeHtml(admin.uuidLabel)}</th>
            <th scope="col">${escapeHtml(admin.roleLabel)}</th>
            <th scope="col">${escapeHtml(admin.createdLabel)}</th>
            <th scope="col"><span class="visually-hidden">${escapeHtml(admin.removeAction)}</span></th>
          </tr>
        </thead>
        <tbody>
        ${developers
          .map(
            (developer): string => `<tr>
          <th scope="row"><code>${escapeHtml(developer.uuid)}</code></th>
          <td>
            <form class="role-form" action="/developers/admin/developers" method="post">
              ${csrfField(csrfToken)}
              <input type="hidden" name="uuid" value="${escapeHtml(developer.uuid)}">
              <label class="visually-hidden" for="role-${escapeHtml(developer.uuid)}">${escapeHtml(admin.roleLabel)}</label>
              <select id="role-${escapeHtml(developer.uuid)}" name="role">
                <option value="developer"${developer.role === 'developer' ? ' selected' : ''}>${escapeHtml(admin.developerRole)}</option>
                <option value="admin"${developer.role === 'admin' ? ' selected' : ''}>${escapeHtml(admin.adminRole)}</option>
              </select>
              <button class="button button-secondary" type="submit">${escapeHtml(admin.saveRoleAction)}</button>
            </form>
          </td>
          <td><time datetime="${escapeHtml(developer.createdAt)}">${escapeHtml(developer.createdAt.slice(0, 10))}</time></td>
          <td class="table-actions"><a class="button button-danger" href="/developers/admin/developers/${encodeURIComponent(developer.uuid)}/delete">${escapeHtml(admin.removeAction)}</a></td>
        </tr>`,
          )
          .join('\n        ')}
        </tbody>
      </table>
    </div>`;

  return `<details class="disclosure"${open ? ' open' : ''}>
      <summary>${escapeHtml(admin.summary)}<span class="disclosure-marker" aria-hidden="true"></span></summary>
      <div class="disclosure-body">
        <h2>${escapeHtml(admin.heading)}</h2>
        <p class="lead">${escapeHtml(admin.intro)}</p>
        <form class="admin-grant" action="/developers/admin/developers" method="post">
          ${csrfField(csrfToken)}
          <div class="field">
            <label for="admin-uuid">${escapeHtml(admin.uuidLabel)}</label>
            <input id="admin-uuid" name="uuid" required autocomplete="off" spellcheck="false" pattern="[0-9a-fA-F-]{36}" placeholder="${escapeHtml(admin.uuidPlaceholder)}">
          </div>
          <div class="field">
            <label for="admin-role">${escapeHtml(admin.roleLabel)}</label>
            <select id="admin-role" name="role">
              <option value="developer">${escapeHtml(admin.developerRole)}</option>
              <option value="admin">${escapeHtml(admin.adminRole)}</option>
            </select>
          </div>
          <button class="button" type="submit">${escapeHtml(admin.addAction)}</button>
        </form>
        ${entries}
      </div>
    </details>`;
}

function csrfField(token: string): string {
  return `<input type="hidden" name="csrfToken" value="${escapeHtml(token)}">`;
}

function pageShell(
  title: string,
  content: string,
  options: { readonly identity?: string; readonly includeScript?: boolean } = {},
): string {
  const strings = english.developer;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="theme-color" content="#0b0e0b">
    <title>${escapeHtml(title)} · ${escapeHtml(strings.navigation.brand)}</title>
    <link rel="stylesheet" href="/assets/developer.css">
    ${options.includeScript === true ? '<script src="/assets/interaction.js" defer></script>' : ''}
  </head>
  <body>
    <a class="skip-link" href="#main">${escapeHtml(english.common.skipToContent)}</a>
    <header class="site-header">
      <div class="container site-header-inner">
        <a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span>${escapeHtml(strings.navigation.brand)}</a>
        <nav class="site-nav" aria-label="${escapeHtml(strings.navigation.ariaLabel)}">
          <a href="/developers">${escapeHtml(strings.navigation.console)}</a>
          ${options.identity ?? ''}
        </nav>
      </div>
    </header>
    ${content}
    <footer class="site-footer">
      <div class="container">${escapeHtml(strings.footer)}</div>
    </footer>
  </body>
</html>`;
}
