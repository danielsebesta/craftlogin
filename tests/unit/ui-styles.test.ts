import { describe, expect, it } from 'vitest';

import { developerStyles } from '../../src/api/developer-assets.js';
import { renderDeveloperDashboard } from '../../src/api/developer-pages.js';
import { interactionStyles } from '../../src/api/interaction-assets.js';
import { permissionsForScope, renderInteractionPage } from '../../src/api/interaction-page.js';
import { landingStyles } from '../../src/api/landing-assets.js';
import { swaggerThemeStyles } from '../../src/api/swagger-theme.js';
import { uiBaseStyles } from '../../src/api/ui/base.js';
import { uiControlStyles } from '../../src/api/ui/controls.js';
import { signInSurfaceStyles } from '../../src/api/ui/surface.js';
import { uiTokenStyles } from '../../src/api/ui/tokens.js';
import { english } from '../../src/locales/en.js';

const pageStyles = [landingStyles, interactionStyles, developerStyles];

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

  it('keeps the ambient background a quiet token-based mask', (): void => {
    expect(uiBaseStyles).toContain('body::before');
    expect(uiBaseStyles).toContain('var(--pattern)');
    expect(uiBaseStyles).toContain('url("/assets/background.svg")');
    expect(uiBaseStyles).toContain('prefers-contrast: more');
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
});

describe('page accessibility contract', (): void => {
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
    expect(html).toContain('name="color-scheme" content="dark"');
    expect(html).toContain('rel="icon"');
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
      userUuid: '123e4567-e89b-42d3-a456-426614174000',
    });

    expect(html).toContain('<label for="app-name">');
    expect(html).toContain('<label for="app-redirects">');
    expect(html).toContain('<label for="admin-identifier">');
    expect(html).toContain('<label for="admin-role">');
    expect(html).toContain('<h1>Developer Console</h1>');
    expect(html).toContain('/api/avatars/123e4567-e89b-42d3-a456-426614174000/face');
    expect(html).not.toContain('<code>123e4567-e89b-42d3-a456-426614174000</code>');
  });

  it('renders every surface from the same document shell', (): void => {
    const interaction = renderInteractionPage({
      appName: 'Community Map',
      code: 'ABCDEFGH',
      interactionId: 'interaction-id',
      minecraftBaseDomain: 'craftlogin.com',
      kind: 'login',
      scope: 'openid',
    });
    const pages = [
      interaction,
      renderDeveloperDashboard({
        apps: [],
        csrfToken: 'csrf-token',
        role: 'developer',
        username: 'VerifiedPlayer',
        userUuid: '123e4567-e89b-42d3-a456-426614174000',
      }),
    ];

    for (const html of pages) {
      expect(html.match(/<h1[\s>]/gu)).toHaveLength(1);
      expect(html.match(/<main[\s>]/gu)).toHaveLength(1);
      expect(html).toContain('<a class="skip-link" href="#main">');
      expect(html).toContain('<header class="page-header">');
      expect(html).toContain('<footer class="page-footer">');
      expect(html).toContain('<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">');
      expect(html).toContain('sizes="64x64"');
      expect(html).toContain('<meta name="theme-color" content="#0b0e0b">');
    }

    expect(interaction).toContain('<body class="page-narrow">');
  });
});

describe('interaction consent permissions', (): void => {
  it('describes known scopes and falls back to code for unknown scopes', (): void => {
    expect(permissionsForScope('openid profile')).toEqual([
      { kind: 'text', text: english.interaction.scopeIdentity },
      { kind: 'text', text: english.interaction.scopeProfile },
    ]);
    expect(permissionsForScope('openid custom')).toEqual([
      { kind: 'text', text: english.interaction.scopeIdentity },
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
});
