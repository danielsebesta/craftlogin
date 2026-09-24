import { describe, expect, it } from 'vitest';

import {
  renderInteractionPage,
  type InteractionPageInput,
} from '../../src/api/interaction-page.js';

const baseInput: InteractionPageInput = {
  appName: 'Maps & More',
  interactionId: 'interaction-id',
  kind: 'login',
  minecraftBaseDomain: 'craftlogin.localhost',
  scope: 'openid profile',
};

describe('consent page application icon', (): void => {
  it('shows an uploaded icon beside the application name', (): void => {
    const page = renderInteractionPage({
      ...baseInput,
      appIconUrl: '/api/apps/cl_icon/icon?v=abc123',
    });

    expect(page).toContain(
      '<span class="consent-app"><img class="consent-app-icon" src="/api/apps/cl_icon/icon?v=abc123" alt="" width="32" height="32" decoding="async">',
    );
  });

  it('omits the icon element when the client has no icon', (): void => {
    const page = renderInteractionPage(baseInput);

    expect(page).not.toContain('consent-app-icon');
    expect(page).toContain('<span class="consent-app"><bdi>Maps &amp; More</bdi></span>');
  });

  it('escapes an icon URL that contains markup', (): void => {
    const page = renderInteractionPage({
      ...baseInput,
      appIconUrl: '/icon"><script>alert(1)</script>',
    });

    expect(page).not.toContain('<script>alert(1)</script>');
    expect(page).toContain('&quot;&gt;&lt;script&gt;');
  });
});
