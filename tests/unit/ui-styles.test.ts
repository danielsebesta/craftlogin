import { describe, expect, it } from 'vitest';

import type { RegisteredApp } from '../../src/api/app-registration.js';
import { renderAutoForwardPage } from '../../src/api/auto-forward-page.js';
import { developerStyles } from '../../src/api/developer-assets.js';
import {
  renderAppIconPage,
  renderCreatedAppPage,
  renderDeleteAppPage,
  renderDeveloperDashboard,
  renderRemoveDeveloperPage,
  renderRequestVerificationPage,
} from '../../src/api/developer-pages.js';
import { docsStyles } from '../../src/api/docs-assets.js';
import { renderDocsPage } from '../../src/api/docs-page.js';
import { interactionScript, interactionStyles } from '../../src/api/interaction-assets.js';
import { renderInteractionErrorPage } from '../../src/api/interaction-error-page.js';
import { permissionsForScope, renderInteractionPage } from '../../src/api/interaction-page.js';
import { landingStyles } from '../../src/api/landing-assets.js';
import { renderLandingPage } from '../../src/api/landing-page.js';
import { legalStyles } from '../../src/api/legal-assets.js';
import { renderLegalPage } from '../../src/api/legal-page.js';
import { renderLogoutPage, renderLogoutSuccessPage } from '../../src/api/logout-page.js';
import { renderMicrosoftOAuthResultPage } from '../../src/api/microsoft-oauth-result-page.js';
import { swaggerThemeStyles } from '../../src/api/swagger-theme.js';
import { uiBaseStyles } from '../../src/api/ui/base.js';
import { uiControlStyles } from '../../src/api/ui/controls.js';
import { signInSurfaceStyles } from '../../src/api/ui/surface.js';
import { uiTokenStyles } from '../../src/api/ui/tokens.js';
import type { ManagedApp } from '../../src/developers/app-management.js';
import type { DeveloperAccess } from '../../src/developers/developer-repository.js';
import { english } from '../../src/locales/en.js';

const pageStyles = [landingStyles, docsStyles, interactionStyles, developerStyles, legalStyles];

const developerUuid = '123e4567-e89b-42d3-a456-426614174000';

const developerAccess: DeveloperAccess = {
  createdAt: '2025-01-02T03:04:05.000Z',
  role: 'developer',
  uuid: developerUuid,
  verified: true,
};

const managedApp: ManagedApp = {
  clientId: 'cl_fixture_maps',
  clientType: 'confidential',
  createdAt: '2025-01-02T03:04:05.000Z',
  id: '123e4567-e89b-42d3-a456-426614174001',
  name: 'Fixture Cartography Studio',
  ownerUuid: developerUuid,
  redirectUris: ['https://maps.example.com/oauth/callback'],
  verification: 'none',
};

const pendingApp: ManagedApp = {
  ...managedApp,
  clientId: 'cl_fixture_pending',
  id: '223e4567-e89b-42d3-a456-426614174002',
  name: 'Pending Review Application',
  verification: 'requested',
  verificationNote: 'We run the community event server.',
  verificationRequestedAt: '2025-01-05T03:04:05.000Z',
};

const iconApp: ManagedApp = {
  ...managedApp,
  iconHash: 'a'.repeat(64),
};

const registeredConfidential: RegisteredApp = {
  clientId: 'cl_fixture_confidential',
  clientSecret: 'fixture-client-secret',
  clientType: 'confidential',
  createdAt: '2025-01-02T03:04:05.000Z',
  id: '323e4567-e89b-42d3-a456-426614174003',
  name: 'Confidential Fixture',
  redirectUris: ['https://app.example.com/oauth/callback'],
};

const registeredPublic: RegisteredApp = {
  clientId: 'cl_fixture_public',
  clientType: 'public',
  createdAt: '2025-01-02T03:04:05.000Z',
  id: '423e4567-e89b-42d3-a456-426614174004',
  name: 'Public Fixture',
  redirectUris: ['https://spa.example.com/callback'],
};

function captureRenderedBody(
  render: (context: Parameters<typeof renderLogoutPage>[0]) => void,
): string {
  const context = { body: '', set: (): void => undefined, type: '' };
  render(context);
  return context.body;
}

const documentPages: readonly { readonly html: string; readonly name: string }[] = [
  { html: renderLandingPage({ showDocumentation: true }), name: 'landing' },
  { html: renderDocsPage(), name: 'docs' },
  { html: renderLegalPage('privacy'), name: 'legal privacy' },
  { html: renderLegalPage('terms'), name: 'legal terms' },
  {
    html: renderDeveloperDashboard({
      apps: [],
      csrfToken: 'csrf-token',
      role: 'developer',
      username: 'VerifiedPlayer',
      userUuid: developerUuid,
    }),
    name: 'console dashboard empty',
  },
  {
    html: renderDeveloperDashboard({
      apps: [managedApp, pendingApp],
      csrfToken: 'csrf-token',
      developers: [developerAccess],
      playerNames: { [developerUuid]: 'VerifiedPlayer' },
      role: 'admin',
      username: 'VerifiedPlayer',
      userUuid: developerUuid,
    }),
    name: 'console dashboard populated',
  },
  { html: renderCreatedAppPage(registeredConfidential), name: 'console created confidential' },
  { html: renderCreatedAppPage(registeredPublic), name: 'console created public' },
  {
    html: renderRequestVerificationPage(managedApp, 'csrf-token'),
    name: 'console request verification',
  },
  { html: renderDeleteAppPage(managedApp, 'csrf-token'), name: 'console delete app' },
  {
    html: renderRemoveDeveloperPage(developerAccess, 'csrf-token'),
    name: 'console remove developer',
  },
  { html: renderAppIconPage(iconApp, 'csrf-token'), name: 'console app icon' },
  {
    html: renderInteractionPage({
      appName: 'Maps & More',
      code: 'ABCDEFGH',
      interactionId: 'interaction-id',
      kind: 'login',
      minecraftBaseDomain: 'craftlogin.com',
      scope: 'openid profile offline_access',
    }),
    name: 'interaction online',
  },
  {
    html: renderInteractionPage({
      allowsMicrosoftVerification: true,
      allowsSkinVerification: true,
      appName: 'Maps & More',
      code: 'ABCDEFGH',
      interactionId: 'interaction-id',
      kind: 'login',
      minecraftBaseDomain: 'craftlogin.com',
      scope: 'openid',
    }),
    name: 'interaction all methods',
  },
  {
    html: renderInteractionPage({
      appName: 'Maps & More',
      interactionId: 'interaction-id',
      kind: 'login',
      minecraftBaseDomain: 'craftlogin.com',
      scope: 'openid',
      skinChallenge: { height: 64, model: 'slim', username: 'VerifiedPlayer' },
    }),
    name: 'interaction skin pending',
  },
  { html: renderInteractionErrorPage('expired'), name: 'interaction error' },
  {
    html: renderInteractionPage({
      accountName: 'VerifiedPlayer',
      appName:
        'An Extremely Long Application Name <Script> & "Quotes" That Keeps Going Past Any Sensible Width',
      interactionId: 'interaction-id',
      kind: 'consent',
      minecraftBaseDomain: 'craftlogin.com',
      scope: 'openid',
    }),
    name: 'interaction consent long name',
  },
  {
    html: renderInteractionPage({
      appName: 'Maps & More',
      interactionId: 'interaction-id',
      kind: 'login',
      minecraftBaseDomain: 'craftlogin.com',
      scope: 'openid profile',
      verifiedPlayer: { uuid: developerUuid, username: 'VerifiedPlayer' },
    }),
    name: 'interaction verified confirmation',
  },
  ...(['ownership-required', 'temporarily-unavailable', 'rejected'] as const).map(
    (kind): { readonly html: string; readonly name: string } => ({
      html: renderMicrosoftOAuthResultPage({
        homeUrl: '/interaction/interaction-id',
        interactionId: 'interaction-id',
        kind,
      }),
      name: `microsoft result ${kind}`,
    }),
  ),
  {
    html: renderMicrosoftOAuthResultPage({ homeUrl: '/', kind: 'expired' }),
    name: 'microsoft result expired',
  },
  {
    html: renderAutoForwardPage('https://client.example.com/callback?code=abc'),
    name: 'auto forward',
  },
  {
    html: captureRenderedBody((context): void => {
      renderLogoutPage(
        context,
        '<form id="op.logoutForm" method="post" action="/oauth2/logout"><input type="hidden" name="xsrf" value="fixture"></form>',
      );
    }),
    name: 'logout',
  },
  {
    html: captureRenderedBody((context): void => {
      renderLogoutSuccessPage(context);
    }),
    name: 'logout success',
  },
];

describe('shared UI styles', (): void => {
  it('keeps every page flat, dark, and focus visible', (): void => {
    for (const styles of pageStyles) {
      expect(styles).toContain('color-scheme: dark');
      expect(styles).toContain('@font-face');
      expect(styles).toContain('font-family: "Pixeloid Sans"');
      expect(styles).toContain(':focus-visible');
      expect(styles).not.toContain('box-shadow');
      expect(styles).not.toContain('clamp(');
      expect(styles).not.toContain('text-transform');
      expect(styles).not.toMatch(/https?:\/\//u);
      for (const match of styles.matchAll(/border-radius:\s*([^;]+);/gu)) {
        expect(match[1]?.trim()).toBe('0');
      }
    }
  });

  it('avoids inline styling and specificity escape hatches', (): void => {
    for (const styles of [...pageStyles, swaggerThemeStyles]) {
      expect(styles).not.toContain('!important');
      expect(styles).not.toContain('overflow-x: clip');
    }
    // The shared backdrop escapes the centered column once, on the viewport.
    expect(uiBaseStyles).toContain('left: calc(50% - 50vw)');
  });

  it('keeps the OpenAPI documentation on the shared tokens and family', (): void => {
    expect(swaggerThemeStyles).toContain('font-family: "Pixeloid Sans"');
    expect(swaggerThemeStyles).toContain('font-family: var(--font-mono)');
    // Swagger UI ships shadows; the theme may only remove them.
    expect(swaggerThemeStyles.replaceAll('box-shadow: none;', '')).not.toContain('box-shadow');
    expect(swaggerThemeStyles).toContain('background: var(--surface)');
    expect(swaggerThemeStyles).toContain('border-color: var(--line)');
    for (const match of swaggerThemeStyles.matchAll(/border-radius:\s*([^;]+);/gu)) {
      expect(match[1]?.trim()).toBe('0');
    }
  });

  it('keeps accessibility overrides in place', (): void => {
    expect(uiBaseStyles).toContain('prefers-reduced-motion: reduce');
    expect(uiBaseStyles).toContain('forced-colors: active');
  });

  it('keeps green a signal instead of decoration', (): void => {
    const buttonRule = /\.button \{[\s\S]*?\}/u.exec(uiControlStyles)?.[0] ?? '';
    const addressRule = /\.signin-address \{[\s\S]*?\}/u.exec(signInSurfaceStyles)?.[0] ?? '';

    expect(buttonRule).not.toContain('--accent');
    expect(addressRule).not.toContain('--accent');
    expect(uiTokenStyles).not.toContain('--warning');
    expect(uiTokenStyles).not.toContain('--accent-ink');
    expect(uiTokenStyles).toContain('--control');
  });

  it('keeps a stable hidden-attribute contract', (): void => {
    expect(uiBaseStyles).toContain('[hidden]:not([hidden="until-found"])');
    for (const styles of pageStyles) {
      expect(styles).not.toContain('[data-method-panel][hidden]');
      expect(styles).not.toContain('.signin-continue[hidden]');
      expect(styles).not.toContain('display: none !important');
    }
    expect(uiControlStyles).toContain(
      'input:where(:not([type="radio"], [type="checkbox"], [type="hidden"]))',
    );
    expect(uiControlStyles).not.toContain('input[type="hidden"] {');
  });

  it('marks destructive navigation with an explicit danger-quiet variant', (): void => {
    expect(uiControlStyles).toContain('.button-danger-quiet');
    expect(uiControlStyles).not.toContain('.table-actions .button-quiet');
    const dashboard = renderDeveloperDashboard({
      apps: [managedApp],
      csrfToken: 'csrf-token',
      developers: [developerAccess],
      role: 'admin',
      username: 'VerifiedPlayer',
      userUuid: developerUuid,
    });
    expect(dashboard).toContain('button button-quiet button-danger-quiet');
    expect(renderDeleteAppPage(managedApp, 'csrf-token')).toContain('button button-danger');
    expect(renderDeleteAppPage(managedApp, 'csrf-token')).not.toContain('button-danger-quiet');
  });

  it('exposes horizontal table scroll regions with labels', (): void => {
    const dashboard = renderDeveloperDashboard({
      apps: [managedApp],
      csrfToken: 'csrf-token',
      developers: [developerAccess],
      role: 'admin',
      username: 'VerifiedPlayer',
      userUuid: developerUuid,
    });
    expect(dashboard).toContain(
      `role="region" aria-label="${english.developer.admin.heading}" tabindex="0"`,
    );

    const docs = renderDocsPage();
    for (const group of english.docs.api.groups) {
      expect(docs).toContain(`role="region" aria-label="${group.heading}" tabindex="0"`);
    }
    expect(docs).toContain('class="table table-scrollable docs-endpoints"');
    expect(dashboard).toContain('class="table table-scrollable"');
    expect(dashboard).toContain(`<code class="table-identifier">${developerUuid}</code>`);
    expect(docsStyles).not.toContain('min-width: 44rem');
  });

  it('keeps tables framed and still', (): void => {
    expect(uiControlStyles).toContain('border: 1px solid var(--line-strong)');
    expect(uiControlStyles).toContain('.table thead th');
    expect(uiControlStyles).not.toContain('tbody tr:hover');
  });

  it('builds panels from the shared card classes', (): void => {
    const landing = renderLandingPage({ showDocumentation: true });
    expect(landing).toContain('class="card landing-card"');
    expect(landing).toContain('class="card landing-card start-card"');
    expect(landing).toContain('card-compact');
    expect(landing).toContain('class="card player-card"');

    const docs = renderDocsPage();
    expect(docs).toContain('class="card card-compact"');

    const dashboard = renderDeveloperDashboard({
      apps: [managedApp, pendingApp],
      csrfToken: 'csrf-token',
      developers: [developerAccess],
      playerNames: { [developerUuid]: 'VerifiedPlayer' },
      role: 'admin',
      username: 'VerifiedPlayer',
      userUuid: developerUuid,
    });
    expect(dashboard).toContain('class="card console-section"');
    expect(dashboard).toContain('class="card disclosure console-create"');
    expect(dashboard).toContain('class="card disclosure console-admin"');
    expect(dashboard).toContain('class="card card-flush app-card"');
    expect(dashboard).toContain('class="card card-compact request-card"');

    const request = renderRequestVerificationPage(managedApp, 'csrf-token');
    expect(request).toContain('class="message-card card stack"');
    expect(request).toContain('<form class="stack" action="/developers/apps/');
  });

  it('keeps the progressive-enhancement script and motion tokens aligned', (): void => {
    expect(interactionScript).toContain('panels.length > 0');
    for (const styles of [...pageStyles, swaggerThemeStyles]) {
      expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
      expect(styles).toContain('--motion-duration: 0s');
    }
  });

  it('shows a few avatar samples on the landing page and every view in the docs', (): void => {
    const landing = renderLandingPage({ showDocumentation: true });
    expect(landing).toContain('/api/avatars/4a11ca60-63b6-451f-82eb-50119d8e5052/face');
    expect(landing).toContain('/api/avatars/4a11ca60-63b6-451f-82eb-50119d8e5052/bust');
    expect(landing).toContain('/api/avatars/4a11ca60-63b6-451f-82eb-50119d8e5052/body');
    expect(landing).not.toContain('/back');
    expect(landing).not.toContain('/processed-skin');

    const docs = renderDocsPage();
    for (const view of english.docs.avatars.views) {
      expect(docs).toContain(`/api/avatars/4a11ca60-63b6-451f-82eb-50119d8e5052/${view.name}`);
      expect(docs).toContain(view.detail);
    }
  });
});

describe('page accessibility contract', (): void => {
  it('renders every page from the same accessible document shell', (): void => {
    for (const page of documentPages) {
      const { html, name } = page;
      expect(html.match(/<h1[\s>]/gu), name).toHaveLength(1);
      expect(html.match(/<main[\s>]/gu), name).toHaveLength(1);
      expect(html, name).toContain('<a class="skip-link" href="#main">');
      expect(html, name).toContain(
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
      );
      expect(html, name).toMatch(/<link rel="stylesheet" href="\/assets\/[a-z]+\.css">/u);
      expect(html, name).toContain('page-backdrop');
      expect(html, name).not.toContain('<style');
      expect(html, name).not.toMatch(/\sstyle\s*=/iu);
      expect(html, name).not.toMatch(/\son[a-z]+\s*=/iu);
      expect(html, name).toContain(
        '<link rel="icon" type="image/webp" href="/favicon-96x96.webp" sizes="96x96" />',
      );
      expect(html, name).toContain(
        '<link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />',
      );
      expect(html, name).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
      expect(html, name).toContain('<link rel="shortcut icon" href="/favicon.ico" />');
      expect(html, name).toContain(
        '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
      );
      expect(html, name).toContain('<link rel="manifest" href="/site.webmanifest" />');
      expect(html, name).toContain('<meta name="theme-color" content="#0b0e0b">');
    }
  });

  it('renders the sign-in surface with a skip link and a live status region', (): void => {
    const html = renderInteractionPage({
      appName: 'Maps & More',
      code: 'ABCDEFGH',
      interactionId: 'interaction-id',
      minecraftBaseDomain: 'craftlogin.com',
      kind: 'login',
      scope: 'openid profile offline_access',
    });

    expect(html).toContain('class="skip-link"');
    expect(html).toContain('<main');
    expect(html).toContain('id="verification-heading"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('data-copy-target');
    expect(html).toContain('data-continue-form');
    expect(html).toContain('Maps &amp; More');
    expect(html).not.toContain('<strong>');
    expect(html).toContain('This app will receive:');
    expect(html).toContain('Stay signed in between visits');
    expect(html).toContain('action="/interaction/interaction-id/abort"');
    expect(html).toContain('action="/interaction/interaction-id/complete"');
    expect(html).toContain('name="color-scheme" content="dark"');
    expect(html).toContain('rel="icon"');
    expect(html).toContain('<body class="page-narrow">');
  });

  it('keeps escaped application text and unchanged form actions', (): void => {
    const consent = renderInteractionPage({
      accountName: 'VerifiedPlayer',
      appName: 'A Very Long Application Name <Script> & "Quotes" Without End For Wrapping Checks',
      interactionId: 'interaction-id',
      kind: 'consent',
      minecraftBaseDomain: 'craftlogin.com',
      scope: 'openid',
    });
    expect(consent).not.toContain('<Script>');
    expect(consent).toContain('&lt;Script&gt;');
    expect(consent).toContain('&quot;Quotes&quot;');
    expect(consent).toContain('action="/interaction/interaction-id/abort"');
    expect(consent).toContain('action="/interaction/interaction-id/switch"');
    expect(consent).toContain('action="/interaction/interaction-id/complete"');

    const request = renderRequestVerificationPage(managedApp, 'csrf-token');
    expect(request).toContain(`action="/developers/apps/${managedApp.id}/verification"`);

    const remove = renderRemoveDeveloperPage(developerAccess, 'csrf-token');
    expect(remove).toContain(`action="/developers/admin/developers/${developerUuid}/delete"`);

    const icon = renderAppIconPage(iconApp, 'csrf-token');
    expect(icon).toContain(`action="/developers/apps/${managedApp.id}/icon"`);
  });

  it('renders the verified account as one labelled chip', (): void => {
    const html = renderInteractionPage({
      accountAvatarUrl: '/avatar.png',
      accountName: 'VerifiedPlayer',
      appName: 'Community Map',
      interactionId: 'interaction-id',
      kind: 'consent',
      minecraftBaseDomain: 'craftlogin.com',
      scope: 'openid',
    });

    expect(html).toContain('class="account-chip"');
    expect(html).toContain('account-chip-name">VerifiedPlayer');
    expect(html).toContain('Signed in as');
    expect(html).toContain('Use a different account');
  });

  it('renders visible labels for every console input', (): void => {
    const html = renderDeveloperDashboard({
      apps: [],
      csrfToken: 'csrf-token',
      developers: [],
      role: 'admin',
      username: 'VerifiedPlayer',
      userUuid: developerUuid,
    });

    expect(html).toContain('<label for="app-name">');
    expect(html).toContain('<label for="app-redirects">');
    expect(html).toContain('<label for="admin-identifier">');
    expect(html).toContain('<label for="admin-role">');
    expect(html).toContain('class="icon-heading"');
    expect(html).toContain('Developer Console</h1>');
    expect(html).toContain('class="heading-icon"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('href="/docs/"');
    expect(html).toContain('/api/avatars/123e4567-e89b-42d3-a456-426614174000/face');
    expect(html).not.toContain('<code>123e4567-e89b-42d3-a456-426614174000</code>');
  });

  it('keeps the brand image as the single accessible name', (): void => {
    for (const page of documentPages) {
      expect(page.html, page.name).toContain('alt="CraftLogin"');
      expect(page.html, page.name).not.toContain('<span class="visually-hidden">CraftLogin</span>');
    }
  });
});

describe('interaction consent permissions', (): void => {
  it('describes known scopes and falls back to code for unknown scopes', (): void => {
    expect(permissionsForScope('openid profile')).toEqual([
      { kind: 'text', text: english.interaction.scopeIdentityCombined },
    ]);
    expect(permissionsForScope('openid custom')).toEqual([
      { kind: 'text', text: english.interaction.scopeIdentity },
      { code: 'custom', kind: 'code' },
    ]);
    expect(permissionsForScope('profile custom')).toEqual([
      { kind: 'text', text: english.interaction.scopeProfile },
      { code: 'custom', kind: 'code' },
    ]);
  });

  it('ignores blank entries and repeated scopes', (): void => {
    expect(permissionsForScope('  openid   openid offline_access ')).toEqual([
      { kind: 'text', text: english.interaction.scopeIdentity },
      { kind: 'text', text: english.interaction.scopeOffline },
    ]);
    expect(permissionsForScope('')).toEqual([]);
  });
});

describe('user-facing copy', (): void => {
  it('avoids em dashes', (): void => {
    expect(JSON.stringify(english)).not.toContain('—');
  });

  it('uses only straight quotes', (): void => {
    expect(JSON.stringify(english)).not.toMatch(/[‘-‟«»‹›]/u);
  });
});
