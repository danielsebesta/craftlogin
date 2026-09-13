import { describe, expect, it } from 'vitest';

import { createLogger } from '../../src/logging/logger.js';

describe('structured logger', (): void => {
  it('redacts OAuth, session, and verification material before serialization', (): void => {
    let output = '';
    const logger = createLogger('info', {
      write: (message): void => {
        output += message;
      },
    });

    logger.info(
      {
        access_token: 'raw-access-token',
        microsoftAccessToken: 'raw-microsoft-token',
        nested: {
          clientSecret: 'raw-client-secret',
          codeVerifier: 'raw-code-verifier',
          identityToken: 'raw-identity-token',
          RpsTicket: 'raw-rps-ticket',
          Token: 'raw-capital-token',
          uhs: 'raw-uhs',
          userHash: 'raw-user-hash',
          verificationCode: 'ABCDEFGH',
          xstsToken: 'raw-xsts-token',
        },
        req: {
          body: 'grant_type=authorization_code&code=raw-code',
          headers: {
            authorization: 'Bearer raw-token',
            cookie: 'raw-cookie',
            'x-csrf-token': 'raw-csrf-token',
          },
          url: '/oauth2/authorize?state=raw-state',
        },
      },
      'redaction test',
    );

    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('raw-access-token');
    expect(output).not.toContain('raw-microsoft-token');
    expect(output).not.toContain('raw-client-secret');
    expect(output).not.toContain('ABCDEFGH');
    expect(output).not.toContain('raw-code');
    expect(output).not.toContain('raw-code-verifier');
    expect(output).not.toContain('raw-identity-token');
    expect(output).not.toContain('raw-rps-ticket');
    expect(output).not.toContain('raw-capital-token');
    expect(output).not.toContain('raw-uhs');
    expect(output).not.toContain('raw-token');
    expect(output).not.toContain('raw-cookie');
    expect(output).not.toContain('raw-csrf-token');
    expect(output).not.toContain('raw-state');
    expect(output).not.toContain('raw-user-hash');
    expect(output).not.toContain('raw-xsts-token');
  });
});
