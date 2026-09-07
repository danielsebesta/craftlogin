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
        nested: {
          clientSecret: 'raw-client-secret',
          verificationCode: 'ABCDEFGH',
        },
        req: {
          body: 'grant_type=authorization_code&code=raw-code',
          headers: { authorization: 'Bearer raw-token', cookie: 'raw-cookie' },
          url: '/oauth2/authorize?state=raw-state',
        },
      },
      'redaction test',
    );

    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('raw-access-token');
    expect(output).not.toContain('raw-client-secret');
    expect(output).not.toContain('ABCDEFGH');
    expect(output).not.toContain('raw-code');
    expect(output).not.toContain('raw-token');
    expect(output).not.toContain('raw-cookie');
    expect(output).not.toContain('raw-state');
  });
});
