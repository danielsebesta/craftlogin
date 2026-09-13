import { describe, expect, it } from 'vitest';

import { loadMicrosoftOAuthCredentials } from '../../src/config/microsoft-oauth.js';

const clientId = '7f143b3d-bf80-4896-86ee-bd902f90ca63';

describe('loadMicrosoftOAuthCredentials', (): void => {
  it('loads a required client id and optional server-only secret', (): void => {
    expect(loadMicrosoftOAuthCredentials({ MICROSOFT_OAUTH_CLIENT_ID: clientId })).toEqual({
      clientId,
    });
    expect(
      loadMicrosoftOAuthCredentials({
        MICROSOFT_OAUTH_CLIENT_ID: clientId,
        MICROSOFT_OAUTH_CLIENT_SECRET: '',
      }),
    ).toEqual({ clientId });
    expect(
      loadMicrosoftOAuthCredentials({
        MICROSOFT_OAUTH_CLIENT_ID: clientId,
        MICROSOFT_OAUTH_CLIENT_SECRET: 'server-secret',
      }),
    ).toEqual({ clientId, clientSecret: 'server-secret' });
  });

  it('fails closed when the client id is absent or malformed', (): void => {
    expect((): unknown => loadMicrosoftOAuthCredentials({})).toThrow();
    expect((): unknown =>
      loadMicrosoftOAuthCredentials({ MICROSOFT_OAUTH_CLIENT_ID: 'not-a-uuid' }),
    ).toThrow();
    expect((): unknown =>
      loadMicrosoftOAuthCredentials({
        MICROSOFT_OAUTH_CLIENT_ID: clientId,
        MICROSOFT_OAUTH_CLIENT_SECRET: 'line-one\nline-two',
      }),
    ).toThrow();
  });
});
