import { describe, expect, it } from 'vitest';

import { english } from '../../src/locales/en.js';
import { verificationSuccessMessage } from '../../src/mc-server/verification-message.js';

describe('verification success kick message', (): void => {
  it('keeps the generic message when no confirmation code exists', (): void => {
    expect(verificationSuccessMessage({ status: 'resolved' })).toBe(english.minecraft.success);
  });

  it('names the application and carries the confirmation code', (): void => {
    const message = verificationSuccessMessage({
      appName: 'Example App',
      confirmCode: 'K7X2QM',
      status: 'resolved',
    });

    expect(message).toContain('Example App');
    expect(message).toContain('K7X2QM');
    expect(message).toContain('Never share this code');
  });

  it('omits the application line when no client name was stored', (): void => {
    const message = verificationSuccessMessage({
      confirmCode: 'K7X2QM',
      status: 'resolved',
    });

    expect(message).toContain('K7X2QM');
    expect(message).not.toContain('Signing in to');
  });

  it('strips formatting escapes and control characters from the application name', (): void => {
    const message = verificationSuccessMessage({
      appName: '§lBold§r  App\nInjected',
      confirmCode: 'K7X2QM',
      status: 'resolved',
    });

    expect(message).not.toContain('§');
    expect(message).not.toContain('\nInjected');
    expect(message).toContain('Bold App Injected');
  });

  it('truncates an oversized application name', (): void => {
    const message = verificationSuccessMessage({
      appName: 'A'.repeat(200),
      confirmCode: 'K7X2QM',
      status: 'resolved',
    });

    const appLine = message.split('\n')[0];
    expect(appLine).toContain('…');
    expect(appLine?.length).toBeLessThan(80);
  });
});
