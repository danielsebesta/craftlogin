import { describe, expect, it } from 'vitest';

import { parseAppRegistrationInput } from '../../src/api/app-registration.js';

describe('parseAppRegistrationInput', (): void => {
  it('accepts exact public-client redirect URIs', (): void => {
    expect(
      parseAppRegistrationInput({
        clientType: 'public',
        name: 'Map Viewer',
        redirectUris: ['https://maps.example/callback', 'http://127.0.0.1:4173/oauth/callback'],
      }),
    ).toEqual({
      clientType: 'public',
      name: 'Map Viewer',
      redirectUris: ['https://maps.example/callback', 'http://127.0.0.1:4173/oauth/callback'],
    });
  });

  it.each([
    ['wildcards', ['https://*.example/callback']],
    ['fragments', ['https://app.example/callback#fragment']],
    ['duplicates', ['https://app.example/callback', 'https://app.example/callback']],
    ['insecure non-loopback origins', ['http://app.example/callback']],
    ['embedded credentials', ['https://user:password@app.example/callback']],
  ])('rejects redirect URI %s', (_caseName, redirectUris): void => {
    expect((): void => {
      parseAppRegistrationInput({
        clientType: 'confidential',
        name: 'Invalid app',
        redirectUris,
      });
    }).toThrow();
  });

  it('rejects silently normalized app names and unknown properties', (): void => {
    expect((): void => {
      parseAppRegistrationInput({
        clientType: 'public',
        name: ' Padded name ',
        redirectUris: ['https://app.example/callback'],
        unexpected: true,
      });
    }).toThrow();
  });
});
