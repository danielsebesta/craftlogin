import { describe, expect, it } from 'vitest';

import { extractChatCode } from '../../src/mc-server/chat-code.js';

const baseDomain = 'craftlogin.com';

describe('lobby chat code extraction', (): void => {
  it.each([
    ['K7MPQ4RX', 'K7MPQ4RX'],
    ['k7mpq4rx', 'K7MPQ4RX'],
    ['  K7MPQ4RX  ', 'K7MPQ4RX'],
    ['K7MPQ4RX.craftlogin.com', 'K7MPQ4RX'],
    ['k7mpq4rx.craftlogin.com', 'K7MPQ4RX'],
    ['K7MPQ4RX.craftlogin.com:25565', 'K7MPQ4RX'],
    ['/verify K7MPQ4RX', 'K7MPQ4RX'],
    ['verify K7MPQ4RX', 'K7MPQ4RX'],
    ['/VERIFY k7mpq4rx', 'K7MPQ4RX'],
    ['/verify K7MPQ4RX.craftlogin.com', 'K7MPQ4RX'],
  ])('accepts %s', (message, expected): void => {
    expect(extractChatCode(message, baseDomain)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'hello CraftLogin',
    'my code is K7MPQ4RX please',
    '/other K7MPQ4RX',
    'verify',
    '/verify',
    'verify not-a-code!',
    'K7MPQ4R',
    'K7MPQ4RXX',
    'K0MPQ4RX',
    'K7MPQ4RX.otherdomain.com',
    'K7MPQ4RX.craftlogin.com.evil.com',
    'x'.repeat(261),
  ])('rejects %s', (message): void => {
    expect(extractChatCode(message, baseDomain)).toBeNull();
  });
});
