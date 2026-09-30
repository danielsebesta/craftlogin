import { describe, expect, it } from 'vitest';

import { renderDeveloperDashboard } from '../../src/api/developer-pages.js';
import { describeUserAgent } from '../../src/api/ui/user-agent.js';
import type { DeveloperSessionView } from '../../src/developers/session-service.js';
import { english } from '../../src/locales/en.js';

const developerUuid = '123e4567-e89b-42d3-a456-426614174000';

const chromeWindowsAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const safariIphoneAgent =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

describe('describeUserAgent', (): void => {
  it('names the browser major version and OS release', (): void => {
    expect(describeUserAgent(chromeWindowsAgent)).toBe('Chrome 154 · Windows 10');
    expect(describeUserAgent(safariIphoneAgent)).toBe('Safari 18 · iOS 18.5');
  });

  it('falls back to the localized label for unrecognized agents', (): void => {
    expect(describeUserAgent('curl/8.5.0')).toBe(english.developer.sessions.unknownAgent);
    expect(describeUserAgent('Other device')).toBe(english.developer.sessions.unknownAgent);
    expect(describeUserAgent('')).toBe(english.developer.sessions.unknownAgent);
    expect(describeUserAgent('   ')).toBe(english.developer.sessions.unknownAgent);
  });
});

describe('developer session list', (): void => {
  it('labels the session card while keeping the raw agent on the title attribute', (): void => {
    const sessions: DeveloperSessionView[] = [
      {
        current: true,
        expiresInSeconds: 3_600,
        networkMatch: true,
        issuedAtMilliseconds: 1_775_000_000_000,
        role: 'developer',
        sessionKeyId: 'a'.repeat(64),
        userAgent: chromeWindowsAgent,
      },
      {
        current: false,
        expiresInSeconds: 1_800,
        networkMatch: false,
        issuedAtMilliseconds: 1_774_000_000_000,
        role: 'developer',
        sessionKeyId: 'b'.repeat(64),
        userAgent: 'Current <browser>',
      },
    ];
    const dashboard = renderDeveloperDashboard({
      apps: [],
      csrfToken: 'csrf-token',
      role: 'developer',
      sessions,
      username: 'VerifiedPlayer',
      userUuid: developerUuid,
    });

    expect(dashboard).toContain('Chrome 154 · Windows 10');
    expect(dashboard).toContain(`title="${chromeWindowsAgent}"`);
    expect(dashboard).not.toContain('>Mozilla/5.0');
    // The raw agent still renders escaped, and unparseable agents fall back.
    expect(dashboard).toContain('title="Current &lt;browser&gt;"');
    expect(dashboard).toContain(english.developer.sessions.unknownAgent);
  });
});
