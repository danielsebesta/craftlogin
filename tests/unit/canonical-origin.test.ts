import { describe, expect, it } from 'vitest';

import { canonicalRedirectTarget } from '../../src/api/canonical-origin.js';

const issuer = 'https://craftlogin.com';

describe('canonical HTTP origin', (): void => {
  it.each([
    ['http', 'craftlogin.com', '/', 'https://craftlogin.com/'],
    ['http', 'www.craftlogin.com', '/docs?q=openid', 'https://craftlogin.com/docs?q=openid'],
    ['https', 'www.craftlogin.com', '/docs?q=openid', 'https://craftlogin.com/docs?q=openid'],
    [
      'http',
      'auth.craftlogin.com',
      '/oauth2/authorize?client_id=test',
      'https://craftlogin.com/oauth2/authorize?client_id=test',
    ],
    [
      'https',
      'auth.craftlogin.com',
      '/oauth2/authorize?client_id=test',
      'https://craftlogin.com/oauth2/authorize?client_id=test',
    ],
  ])('redirects %s://%s to the canonical HTTPS origin', (protocol, host, path, expected): void => {
    expect(canonicalRedirectTarget({ host, path, protocol }, issuer)).toBe(expected);
  });

  it('leaves the canonical HTTPS origin unchanged', (): void => {
    expect(
      canonicalRedirectTarget({ host: 'craftlogin.com', path: '/', protocol: 'https' }, issuer),
    ).toBeUndefined();
  });

  it('does not redirect an unrelated host', (): void => {
    expect(
      canonicalRedirectTarget({ host: 'example.com', path: '/', protocol: 'http' }, issuer),
    ).toBeUndefined();
  });
});
