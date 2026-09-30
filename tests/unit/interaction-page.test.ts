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
      `<span class="consent-app"><bdi>Maps &amp; More</bdi><span class="verification-badge verification-badge-verified"`,
    );
    expect(page).toContain(`title="${english.interaction.verifiedAppBadge}"`);
    expect(page).toContain(
      `<span class="visually-hidden">${english.interaction.verifiedAppBadge}</span>`,
    );
    // The icon is inlined so it inherits text color; an <img> would not and
    // would add a second request.
    expect(page).toContain('<span class="verification-badge-dot"><svg');
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

describe('verified identity confirmation', (): void => {
  const verifiedPlayer = {
    uuid: '853c80ef-3c37-49fd-aa49-938b674adae6',
    username: 'VerifiedPlayer',
  };

  it('shows the confirmed player with continue and not-you actions', (): void => {
    const page = renderInteractionPage({ ...baseInput, code: 'ABCDEFGH', verifiedPlayer });

    expect(page).toContain('verified-confirmation');
    expect(page).toContain(english.interaction.confirmation.heading);
    expect(page).toContain('<bdi>VerifiedPlayer</bdi>');
    expect(page).toContain(`/api/avatars/${verifiedPlayer.uuid}/face?size=64&amp;layers=all`);
    expect(page).toContain('action="/interaction/interaction-id/complete"');
    expect(page).toContain('action="/interaction/interaction-id/not-you"');
    expect(page).toContain(english.interaction.confirmation.notYou);
  });

  it('hides the method picker and join address while confirmation is pending', (): void => {
    const page = renderInteractionPage({
      ...baseInput,
      allowsMicrosoftVerification: true,
      allowsSkinVerification: true,
      code: 'ABCDEFGH',
      skinChallenge: { height: 64, model: 'slim', username: 'VerifiedPlayer' },
      verifiedPlayer,
    });

    expect(page).not.toContain('method-picker');
    expect(page).not.toContain('signin-address');
    expect(page).not.toContain('skin-verification');
    expect(page).not.toContain('microsoft-verification');
    expect(page).not.toContain('ABCDEFGH');
  });

  it('escapes a verified username that contains markup', (): void => {
    const page = renderInteractionPage({
      ...baseInput,
      verifiedPlayer: { uuid: verifiedPlayer.uuid, username: '<img src=x onerror=alert(1)>' },
    });

    expect(page).not.toContain('<img src=x onerror=alert(1)>');
    expect(page).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('skin verification lookup', (): void => {
  it('renders a head preview placeholder wired to the avatar endpoint', (): void => {
    const page = renderInteractionPage({ ...baseInput, allowsSkinVerification: true });

    expect(page).toContain('data-skin-avatar');
    expect(page).toContain('skin-lookup-avatar');
    expect(page).toContain(
      'data-avatar-url-template="/api/avatars/{uuid}/face?size=64&amp;layers=all"',
    );
  });
});

describe('consent page method picker', (): void => {
  it('hides the verification method picker even with multiple methods enabled', (): void => {
    const page = renderInteractionPage({
      ...baseInput,
      kind: 'consent',
      allowsMicrosoftVerification: true,
      allowsSkinVerification: true,
    });

    expect(page).not.toContain('method-picker');
    expect(page).not.toContain('consent-verify');
    expect(page).not.toContain('skin-verification');
    expect(page).not.toContain('microsoft-verification');
  });
});

describe('signed-in account chip', (): void => {
  it('links to the account page for connected-app management', (): void => {
    const page = renderInteractionPage({
      ...baseInput,
      accountName: 'VerifiedPlayer',
      kind: 'consent',
    });

    expect(page).toContain('account-chip');
    expect(page).toContain('VerifiedPlayer');
    expect(page).toContain(
      `<a class="account-chip-link" href="/account">${english.interaction.manageAccount}</a>`,
    );
  });

  it('hides the account chip when the visitor is not signed in', (): void => {
    const page = renderInteractionPage({ ...baseInput, kind: 'consent' });

    expect(page).not.toContain('account-chip');
    expect(page).not.toContain('account-chip-link');
  });
});

describe('consent page application icon', (): void => {
  it('shows an uploaded icon above the application name', (): void => {
    const page = renderInteractionPage({
      ...baseInput,
      appIconUrl: '/api/apps/cl_icon/icon?v=abc123',
    });

    expect(page).toContain(
      '<img class="consent-app-icon" src="/api/apps/cl_icon/icon?v=abc123" alt="" width="64" height="64" decoding="async"><div class="consent-title">',
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
