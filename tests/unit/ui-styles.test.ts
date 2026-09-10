import { describe, expect, it } from 'vitest';

import { developerStyles } from '../../src/api/developer-assets.js';
import { renderDeveloperDashboard } from '../../src/api/developer-pages.js';
import { swaggerTypographyStyles } from '../../src/api/font-assets.js';
import { interactionStyles } from '../../src/api/interaction-assets.js';
import { renderInteractionPage } from '../../src/api/interaction-page.js';
import { landingStyles } from '../../src/api/landing-assets.js';
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

  it('keeps the OpenAPI documentation typography on the same family', (): void => {
    expect(swaggerTypographyStyles).toContain('font-family: "Pixeloid Sans"');
    expect(swaggerTypographyStyles).not.toContain('box-shadow');
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
    expect(html).toContain('name="color-scheme" content="dark"');
  });

  it('renders visible labels for every console input', (): void => {
    const html = renderDeveloperDashboard({
      apps: [],
      csrfToken: 'csrf-token',
      developers: [],
      role: 'admin',
      userUuid: '123e4567-e89b-42d3-a456-426614174000',
    });

    expect(html).toContain('<label for="app-name">');
    expect(html).toContain('<label for="app-redirects">');
    expect(html).toContain('<label for="admin-uuid">');
    expect(html).toContain('<label for="admin-role">');
    expect(html).toContain('<h1>Developer Console</h1>');
  });
});

describe('user-facing copy', (): void => {
  it('avoids em dashes', (): void => {
    expect(JSON.stringify(english)).not.toContain('—');
  });
});
