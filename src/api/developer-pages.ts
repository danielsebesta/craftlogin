import type { DeveloperAccess, DeveloperRole } from '../developers/developer-repository.js';
import type { ManagedApp } from '../developers/app-management.js';
import type { DeveloperLoginAttempt } from '../developers/login-service.js';
import { english } from '../locales/en.js';
import type { RegisteredApp } from './app-registration.js';
import { escapeHtml } from './html.js';
import { renderConsoleShell } from './ui/console-shell.js';
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
  readonly username: string;
  readonly userUuid: string;
}

export function renderDeveloperLoginPage(
  attempt: DeveloperLoginAttempt,
  minecraftBaseDomain: string,
  skinError?: 'not-found' | 'unavailable',
): string {
  const developer = english.developer;
  const interaction = english.interaction;
  const skin = interaction.skin;
  const skinChallenge = attempt.skinChallenge;
  const address =
    attempt.code === null
      ? attempt.status === 'verified'
        ? developer.login.verifiedAddress
        : developer.login.addressPending
      : `${attempt.code}.${minecraftBaseDomain}`;
  const verified = attempt.status === 'verified';

  return renderSignInPage({
    accountLabel: interaction.signedInAs,
    action: '/developers/login/complete',
    allowsHeading: interaction.allowsHeading,
    appName: developer.login.appName,
    brand: developer.navigation.brand,
    continueLabel: interaction.continueButton,
    copiedLabel: interaction.copied,
    copyLabel: interaction.copyAddress,
    documentTitle: `${developer.login.appName} · ${interaction.title}`,
    footer: interaction.footer,
    heading: interaction.heading,
    lead: interaction.lead,
    messages:
      skinChallenge === undefined
        ? interaction.status
        : { ...interaction.status, pending: skin.statusPending },
    noJavaScript: interaction.noJavaScript,
    permissions: [{ kind: 'text', text: developer.login.permission }],
    securityNote: interaction.securityNote,
    skinVerification: {
      accountLabel: skin.accountLabel,
      accountPlaceholder: skin.accountPlaceholder,
      heading: skin.headingAlternative,
      hint: skin.startHint,
      startAction: '/developers/login/skin/start',
      startLabel: skin.startButton,
      ...(skinError === undefined
        ? {}
        : {
            error:
              skinError === 'not-found'
                ? developer.login.skinNotFound
                : developer.login.skinUnavailable,
          }),
      ...(skinChallenge === undefined
        ? {}
        : {
            challenge: {
              downloadLabel: skin.downloadButton,
              downloadUrl: '/developers/login/skin/download',
              format: skinChallenge.height === 32 ? skin.formatLegacy : skin.formatModern,
              formatLabel: skin.formatLabel,
              model: skinChallenge.model === 'slim' ? skin.modelSlim : skin.modelClassic,
              modelLabel: skin.modelLabel,
              steps: skin.steps,
              username: skinChallenge.username,
              usernameLabel: skin.usernameLabel,
            },
          }),
    },
    verification: {
      address,
      addressLabel: interaction.addressLabel,
      initialStatus: verified
        ? interaction.status.verified
        : skinChallenge === undefined
          ? interaction.status.pending
          : skin.statusPending,
      initialStatusState: verified ? 'verified' : 'pending',
      statusUrl:
        skinChallenge === undefined ? '/developers/login/status' : '/developers/login/skin/status',
      steps: interaction.steps,
      stepsHeading: interaction.stepsHeading,
    },
  });
}

export function renderDeveloperAccessDeniedPage(): string {
  const strings = english.developer;
  return renderConsoleShell(strings.accessDenied.title, {
    className: 'container message-layout',
    content: `      <section class="message-card card" aria-labelledby="denied-heading">
        <h1 id="denied-heading">${escapeHtml(strings.accessDenied.heading)}</h1>
        <p class="lead">${escapeHtml(strings.accessDenied.detail)}</p>
        <div class="button-row">
          <a class="button" href="/developers/login">${escapeHtml(strings.accessDenied.retry)}</a>
        </div>
      </section>`,
  });
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
  const identity = `<span class="console-session">
          <span class="console-session-player">
            <img class="console-session-head" src="/api/avatars/${encodeURIComponent(input.userUuid)}/face?size=32&amp;layers=all" alt="" width="32" height="32" decoding="async">
            <span><span class="visually-hidden">${escapeHtml(strings.dashboard.signedInAs)} </span>${escapeHtml(input.username)}</span>
          </span>
          <span class="console-session-role">${escapeHtml(roleLabel)}</span>
          <form action="/developers/logout" method="post">
            ${csrfField(input.csrfToken)}
            <button class="button-quiet" type="submit">${escapeHtml(strings.dashboard.logout)}</button>
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
      <section class="console-section" aria-labelledby="apps-heading">
        <div class="console-section-head">
          <h2 id="apps-heading">${escapeHtml(strings.dashboard.applicationsHeading)}</h2>
          <a class="console-section-link" href="/docs/">${escapeHtml(strings.dashboard.docsLink)}</a>
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
  if (notice === 'last-admin') {
    return `      <p class="notice" role="status">${escapeHtml(strings.admin.lastAdminNotice)}</p>\n`;
  }
  if (notice === 'invalid-form') {
    return `      <p class="notice notice-error" role="alert">${escapeHtml(strings.admin.invalidFormNotice)}</p>\n`;
  }
  return `      <p class="notice notice-error" role="alert">${escapeHtml(strings.admin.notFoundNotice)}</p>\n`;
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
          ? `<span class="app-meta">${escapeHtml(strings.ownerLabel)}: <code>${escapeHtml(app.ownerUuid ?? strings.unassignedOwner)}</code></span>`
          : '';
      return `<tr>
          <th scope="row">
            <span class="app-name">${escapeHtml(app.name)}</span>
            <span class="app-meta">${escapeHtml(app.clientType === 'public' ? strings.publicLabel : strings.confidentialLabel)}</span>${owner}
          </th>
          <td><code>${escapeHtml(app.clientId)}</code></td>
          <td><ul class="redirect-list">${redirects}</ul></td>
          <td class="table-actions"><a class="button button-quiet" href="/developers/apps/${encodeURIComponent(app.id)}/delete">${escapeHtml(strings.deleteAction)}</a></td>
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
          <td class="table-actions"><a class="button button-quiet" href="/developers/admin/developers/${encodeURIComponent(developer.uuid)}/delete">${escapeHtml(admin.removeAction)}</a></td>
        </tr>`,
          )
          .join('\n        ')}
        </tbody>
      </table>
    </div>`;

  return `
    <details class="disclosure"${open ? ' open' : ''}>
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
      </div>
    </details>`;
}

function csrfField(token: string): string {
  return `<input type="hidden" name="csrfToken" value="${escapeHtml(token)}">`;
}
