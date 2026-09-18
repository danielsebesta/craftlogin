import type { DeveloperAccess, DeveloperRole } from '../developers/developer-repository.js';
import type { ManagedApp } from '../developers/app-management.js';
import { english } from '../locales/en.js';
import type { RegisteredApp } from './app-registration.js';
import { escapeHtml } from './html.js';
import { renderConsoleShell } from './ui/console-shell.js';
import { renderOAuthErrorPage } from './ui/oauth-error-page.js';
import { renderVerificationBadge } from './ui/verification-badge.js';

export type DashboardNotice =
  | 'developer-unverified'
  | 'developer-verified'
  | 'invalid-form'
  | 'last-admin'
  | 'not-found'
  | 'verification-approved'
  | 'verification-rejected'
  | 'verification-requested'
  | 'verification-revoked'
  | 'verification-unavailable';

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
  readonly username: string;
  readonly userUuid: string;
}

export function renderDeveloperAccessDeniedPage(): string {
  const strings = english.developer.accessDenied;
  return renderOAuthErrorPage({
    action: { href: '/developers/login', kind: 'link', label: strings.retry },
    brand: english.interaction.brand,
    footer: english.interaction.footer,
    heading: strings.heading,
    lead: strings.detail,
    title: strings.title,
  });
}

export function renderDeveloperDashboard(input: DeveloperDashboardInput): string {
  const strings = english.developer;
  const roleLabel =
    input.role === 'admin' ? strings.dashboard.adminBadge : strings.dashboard.developerBadge;
  const adminPanel =
    input.role === 'admin' && input.developers !== undefined
      ? renderAdministratorPanel(input.developers, input.apps, input.csrfToken, input.notice)
      : '';
  const formOpen = input.apps.length === 0 || input.formError !== undefined;
  const formErrorNotice =
    input.formError === undefined
      ? ''
      : `<p class="notice notice-error" role="alert">${escapeHtml(input.formError)}</p>`;
  const identity = `<span class="console-session">
          <span class="console-session-player">
            <img class="console-session-head" src="/api/avatars/${encodeURIComponent(input.userUuid)}/face?size=32&amp;layers=all" alt="" width="32" height="32" decoding="async">
            <span><span class="visually-hidden">${escapeHtml(strings.dashboard.signedInAs)} </span>${escapeHtml(input.username)}</span>
          </span>
          <span class="console-session-role">${escapeHtml(roleLabel)}</span>
          <form action="/developers/logout" method="post">
            ${csrfField(input.csrfToken)}
            <button class="button button-quiet" type="submit">${escapeHtml(strings.dashboard.logout)}</button>
          </form>
        </span>`;

  return renderConsoleShell(
    strings.dashboard.heading,
    {
      className: 'container console-main',
      content: `      <header class="console-intro">
        <h1>${escapeHtml(strings.dashboard.heading)}</h1>
        <p class="lead">${escapeHtml(strings.dashboard.lead)}</p>
      </header>
      ${renderDashboardNotice(input.notice)}
      <div class="console-workspace">
        <section class="console-section" aria-labelledby="apps-heading">
          <div class="console-section-head">
            <h2 id="apps-heading">${escapeHtml(strings.dashboard.applicationsHeading)}</h2>
            <a class="button button-secondary console-section-link" href="/docs/">${escapeHtml(strings.dashboard.docsLink)}</a>
          </div>
          ${renderAppList(input.apps, input.role, input.csrfToken)}
        </section>

        <details class="disclosure console-create"${formOpen ? ' open' : ''}>
          <summary>${escapeHtml(strings.app.newHeading)}<span class="disclosure-marker" aria-hidden="true"></span></summary>
          <div class="disclosure-body">
            ${formErrorNotice}
            ${renderRegistrationForm(input.csrfToken, input.formValues)}
          </div>
        </details>
      </div>
      ${adminPanel}`,
    },
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
      : `
        <div class="credential">
          <p class="field-label">${escapeHtml(strings.app.secretLabel)}</p>
          <code id="client-secret">${escapeHtml(app.clientSecret)}</code>
          <div class="button-row">
            <button type="button" class="button button-secondary" data-copy-target="#client-secret" data-copied-label="${escapeHtml(interaction.copied)}" hidden>${escapeHtml(strings.app.copyLabel)}</button>
          </div>
        </div>`;

  return renderConsoleShell(
    strings.app.createdTitle,
    {
      className: 'container message-layout',
      content: `      <section class="message-card card" aria-labelledby="created-heading">
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
        </dl>${secret}
        <div class="button-row">
          <a class="button" href="/developers">${escapeHtml(strings.navigation.console)}</a>
        </div>
      </section>`,
    },
    { script: true },
  );
}

export function renderRequestVerificationPage(app: ManagedApp, csrfToken: string): string {
  const strings = english.developer;
  return renderConsoleShell(strings.app.requestTitle, {
    className: 'container message-layout',
    content: `      <section class="message-card card" aria-labelledby="request-heading">
        <h1 id="request-heading">${escapeHtml(strings.app.requestHeading)}</h1>
        <p class="lead">${escapeHtml(strings.app.requestIntro)}</p>
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
        <form action="/developers/apps/${encodeURIComponent(app.id)}/verification" method="post">
          ${csrfField(csrfToken)}
          <div class="field">
            <label for="verification-note">${escapeHtml(strings.app.requestNoteLabel)}</label>
            <textarea id="verification-note" name="note" rows="5" maxlength="500" autocomplete="off" spellcheck="true"></textarea>
            <small class="field-hint">${escapeHtml(strings.app.requestNoteHint)}</small>
          </div>
          <div class="button-row">
            <button class="button" type="submit">${escapeHtml(strings.app.requestAction)}</button>
            <a class="button button-secondary" href="/developers">${escapeHtml(strings.app.requestCancel)}</a>
          </div>
        </form>
      </section>`,
  });
}

export function renderDeleteAppPage(app: ManagedApp, csrfToken: string): string {
  const strings = english.developer;
  return renderConsoleShell(strings.confirm.appTitle, {
    className: 'container message-layout',
    content: `      <section class="message-card card" aria-labelledby="confirm-heading">
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
      </section>`,
  });
}

export function renderRemoveDeveloperPage(developer: DeveloperAccess, csrfToken: string): string {
  const strings = english.developer;
  const roleLabel =
    developer.role === 'admin' ? strings.admin.adminRole : strings.admin.developerRole;
  return renderConsoleShell(strings.confirm.developerTitle, {
    className: 'container message-layout',
    content: `      <section class="message-card card" aria-labelledby="confirm-heading">
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
      </section>`,
  });
}

function renderDashboardNotice(notice: DashboardNotice | undefined): string {
  const strings = english.developer;
  if (notice === undefined) {
    return '';
  }
  if (notice === 'invalid-form') {
    return noticeLine(strings.admin.invalidFormNotice, true);
  }
  if (notice === 'not-found') {
    return noticeLine(strings.admin.notFoundNotice, true);
  }
  const status = {
    'developer-unverified': strings.admin.verificationDeveloperNotice,
    'developer-verified': strings.admin.verificationDeveloperNotice,
    'last-admin': strings.admin.lastAdminNotice,
    'verification-approved': strings.admin.verificationApprovedNotice,
    'verification-rejected': strings.admin.verificationRejectedNotice,
    'verification-requested': strings.admin.verificationRequestedNotice,
    'verification-revoked': strings.admin.verificationRevokedNotice,
    'verification-unavailable': strings.admin.verificationUnavailableNotice,
  } satisfies Record<Exclude<DashboardNotice, 'invalid-form' | 'not-found'>, string>;
  const message = status[notice];
  return noticeLine(message, notice === 'verification-unavailable');
}

function noticeLine(message: string, alert: boolean): string {
  return `      <p class="notice${alert ? ' notice-error' : ''}" role="${alert ? 'alert' : 'status'}">${escapeHtml(message)}</p>\n`;
}

function renderAppList(
  apps: readonly ManagedApp[],
  role: DeveloperRole,
  csrfToken: string,
): string {
  const strings = english.developer.app;
  if (apps.length === 0) {
    return `<p class="empty-state">${escapeHtml(strings.empty)}</p>`;
  }

  const cards = apps
    .map((app): string => {
      const redirects = app.redirectUris
        .map((uri): string => `<li><code>${escapeHtml(uri)}</code></li>`)
        .join('');
      const owner =
        role === 'admin'
          ? `<div>
                <dt>${escapeHtml(strings.ownerLabel)}</dt>
                <dd><code>${escapeHtml(app.ownerUuid ?? strings.unassignedOwner)}</code></dd>
              </div>`
          : '';
      return `<li class="app-card">
          <article>
            <header class="app-card-header">
              <div>
                <h3 class="app-name">${escapeHtml(app.name)}</h3>
                <p class="app-meta">${escapeHtml(app.clientType === 'public' ? strings.publicLabel : strings.confidentialLabel)}</p>
              </div>
              ${renderAppVerificationCell(app)}
            </header>
            <dl class="app-card-details">
              <div>
                <dt>${escapeHtml(strings.clientIdLabel)}</dt>
                <dd><code>${escapeHtml(app.clientId)}</code></dd>
              </div>
              <div>
                <dt>${escapeHtml(strings.redirectLabel)}</dt>
                <dd><ul class="redirect-list">${redirects}</ul></dd>
              </div>
              ${owner}
            </dl>
            <footer class="app-card-actions">${renderAppActions(app, role, csrfToken)}</footer>
          </article>
        </li>`;
    })
    .join('\n        ');

  return `<ul class="app-grid">
        ${cards}
      </ul>`;
}

function renderAppVerificationCell(app: ManagedApp): string {
  const strings = english.developer;
  if (app.verification === 'verified') {
    return renderVerificationBadge({
      kind: 'app',
      label: strings.verification.badgeVerified,
      state: 'verified',
    });
  }
  if (app.verification === 'requested') {
    return renderVerificationBadge({
      kind: 'app',
      label: strings.verification.badgePending,
      state: 'pending',
    });
  }
  return `<span class="app-meta">${escapeHtml(strings.verification.notVerified)}</span>`;
}

function renderAppActions(app: ManagedApp, role: DeveloperRole, csrfToken: string): string {
  const strings = english.developer;
  const actions: string[] = [];
  if (role === 'admin') {
    // An administrator verifies an application that never applied, or withdraws an
    // existing verification. Pending requests are decided in the review queue, so
    // they are not duplicated here.
    if (app.verification === 'none') {
      actions.push(verificationDecisionForm(app, 'approve', strings.admin.verifyAction, csrfToken));
    }
    if (app.verification === 'verified') {
      actions.push(verificationDecisionForm(app, 'revoke', strings.admin.revokeAction, csrfToken));
    }
  }
  if (role !== 'admin' && app.verification === 'none') {
    actions.push(
      `<a class="button button-quiet" href="/developers/apps/${encodeURIComponent(app.id)}/verification">${escapeHtml(strings.app.requestAction)}</a>`,
    );
  }
  actions.push(
    `<a class="button button-quiet" href="/developers/apps/${encodeURIComponent(app.id)}/delete">${escapeHtml(strings.app.deleteAction)}</a>`,
  );
  return `<div class="row-actions">${actions.join('')}</div>`;
}

function verificationDecisionForm(
  app: ManagedApp,
  decision: 'approve' | 'revoke',
  label: string,
  csrfToken: string,
): string {
  return `<form class="row-action-form" action="/developers/admin/apps/${encodeURIComponent(app.id)}/verification" method="post">
              ${csrfField(csrfToken)}
              <input type="hidden" name="decision" value="${decision}">
              <button class="button button-quiet" type="submit">${escapeHtml(label)}</button>
            </form>`;
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
  apps: readonly ManagedApp[],
  csrfToken: string,
  notice: DashboardNotice | undefined,
): string {
  const strings = english.developer;
  const admin = strings.admin;
  const open = notice !== undefined && notice !== 'verification-requested';
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
            <th scope="col">${escapeHtml(english.developer.dashboard.verificationColumnLabel)}</th>
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
          <td>${renderDeveloperVerificationCell(developer, csrfToken)}</td>
          <td><time datetime="${escapeHtml(developer.createdAt)}">${escapeHtml(developer.createdAt.slice(0, 10))}</time></td>
          <td class="table-actions"><a class="button button-quiet" href="/developers/admin/developers/${encodeURIComponent(developer.uuid)}/delete">${escapeHtml(admin.removeAction)}</a></td>
        </tr>`,
          )
          .join('\n        ')}
        </tbody>
      </table>
    </div>`;

  return `
    <details class="disclosure console-admin"${open ? ' open' : ''}>
      <summary>${escapeHtml(admin.summary)}<span class="disclosure-marker" aria-hidden="true"></span></summary>
      <div class="disclosure-body">
        <p class="lead">${escapeHtml(admin.intro)}</p>
        <form class="admin-grant" action="/developers/admin/developers" method="post">
          ${csrfField(csrfToken)}
          <div class="field">
            <label for="admin-identifier">${escapeHtml(admin.identifierLabel)}</label>
            <input id="admin-identifier" name="uuid" required maxlength="64" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(admin.identifierPlaceholder)}">
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
        ${renderVerificationQueue(apps, csrfToken)}
      </div>
    </details>`;
}

function renderDeveloperVerificationCell(developer: DeveloperAccess, csrfToken: string): string {
  const strings = english.developer;
  const badge = developer.verified
    ? renderVerificationBadge({
        kind: 'developer',
        label: strings.dashboard.verifiedDeveloperBadge,
        state: 'verified',
      })
    : `<span class="app-meta">${escapeHtml(strings.verification.notVerified)}</span>`;
  const action = developer.verified ? strings.admin.unverifyAction : strings.admin.verifyAction;
  return `<div class="row-actions row-actions-stacked">
            ${badge}
            <form class="row-action-form" action="/developers/admin/developers/${encodeURIComponent(developer.uuid)}/verification" method="post">
              ${csrfField(csrfToken)}
              <input type="hidden" name="decision" value="${developer.verified ? 'revoke' : 'verify'}">
              <button class="button button-quiet" type="submit">${escapeHtml(action)}</button>
            </form>
          </div>`;
}

function renderVerificationQueue(apps: readonly ManagedApp[], csrfToken: string): string {
  const strings = english.developer;
  const admin = strings.admin;
  const pending = apps.filter((app): boolean => app.verification === 'requested');
  const items =
    pending.length === 0
      ? `<p class="empty-state">${escapeHtml(admin.verificationEmpty)}</p>`
      : `<ul class="request-list">
        ${pending
          .map(
            (app): string => `<li class="request-card">
          <p class="app-name">${escapeHtml(app.name)}</p>
          <p class="app-meta"><code>${escapeHtml(app.clientId)}</code> · <code>${escapeHtml(app.ownerUuid ?? strings.app.unassignedOwner)}</code></p>
          ${
            app.verificationRequestedAt === undefined
              ? ''
              : `<p class="app-meta">${escapeHtml(admin.requestedLabel)}: <time datetime="${escapeHtml(app.verificationRequestedAt)}">${escapeHtml(app.verificationRequestedAt.slice(0, 10))}</time></p>`
          }
          <p class="request-note">${escapeHtml(app.verificationNote ?? admin.noNote)}</p>
          <div class="button-row">
            <form class="row-action-form" action="/developers/admin/apps/${encodeURIComponent(app.id)}/verification" method="post">
              ${csrfField(csrfToken)}
              <input type="hidden" name="decision" value="approve">
              <button class="button button-secondary" type="submit">${escapeHtml(admin.approveAction)}</button>
            </form>
            <form class="row-action-form" action="/developers/admin/apps/${encodeURIComponent(app.id)}/verification" method="post">
              ${csrfField(csrfToken)}
              <input type="hidden" name="decision" value="reject">
              <button class="button button-quiet" type="submit">${escapeHtml(admin.rejectAction)}</button>
            </form>
          </div>
        </li>`,
          )
          .join('\n        ')}
      </ul>`;

  return `        <section class="verification-queue" aria-labelledby="verification-heading">
          <h3 id="verification-heading">${escapeHtml(admin.verificationHeading)}</h3>
          <p class="lead">${escapeHtml(admin.verificationIntro)}</p>
          ${items}
        </section>`;
}

function csrfField(token: string): string {
  return `<input type="hidden" name="csrfToken" value="${escapeHtml(token)}">`;
}
