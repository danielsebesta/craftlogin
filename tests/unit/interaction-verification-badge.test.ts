import { describe, expect, it } from 'vitest';

import {
  renderInteractionPage,
  type InteractionPageInput,
} from '../../src/api/interaction-page.js';
import { english } from '../../src/locales/en.js';

const baseInput: InteractionPageInput = {
  appName: 'Maps & More',
  interactionId: 'interaction-id',
  kind: 'login',
  minecraftBaseDomain: 'craftlogin.localhost',
  scope: 'openid profile',
};

describe('consent page verification badge', (): void => {
  it('labels a verified application beside its name', (): void => {
    const page = renderInteractionPage({ ...baseInput, appVerified: true });

    expect(page).toContain(
      `<span class="consent-app"><bdi>Maps &amp; More</bdi><span class="verification-badge verification-badge-verified">`,
    );
    expect(page).toContain(english.interaction.verifiedAppBadge);
    // The icon is inlined so it inherits the surrounding text color; an <img>
    // reference to a vendored SVG would not and would add a second request.
    expect(page).toContain('<span class="verification-badge verification-badge-verified"><svg');
    expect(page).toContain('fill="currentColor"');
    expect(page).toContain('aria-hidden="true"');
  });

  it('shows no badge for an unverified application', (): void => {
    const page = renderInteractionPage(baseInput);

    expect(page).toContain('<span class="consent-app"><bdi>Maps &amp; More</bdi></span>');
    expect(page).not.toContain('verification-badge');
    expect(page).not.toContain(english.interaction.verifiedAppBadge);
  });

  it('escapes an application name that contains markup', (): void => {
    const page = renderInteractionPage({
      ...baseInput,
      appName: '<script>alert(1)</script>',
      appVerified: true,
    });

    expect(page).not.toContain('<script>alert(1)</script>');
    expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
