import { describe, expect, it } from 'vitest';

import { extractVerificationCode, isLobbyHost } from '../../src/mc-server/hostname.js';

describe('extractVerificationCode', (): void => {
  it.each([
    ['ABCDEFGH.craftlogin.com', 'ABCDEFGH'],
    ['abcdefgh.craftlogin.com', 'ABCDEFGH'],
    ['ABCDEFGH.CRAFTLOGIN.COM', 'ABCDEFGH'],
    ['ABCDEFGH.craftlogin.com.', 'ABCDEFGH'],
    ['ABCDEFGH.craftlogin.com:25565', 'ABCDEFGH'],
    ['ABCDEFGH.craftlogin.com.:25565', 'ABCDEFGH'],
    ['ABCDEFGH.craftlogin.com\0FML\0', 'ABCDEFGH'],
    ['ABCDEFGH.craftlogin.com:25565\0FML2\0forwarded-data', 'ABCDEFGH'],
  ])('extracts a code from %s', (serverHost, expected): void => {
    expect(extractVerificationCode(serverHost, 'craftlogin.com')).toBe(expected);
  });

  it.each([
    '',
    'craftlogin.com',
    'ABCDEFGH.login.craftlogin.com',
    'ABCDEFGH.example.com',
    'ABC0EFGH.craftlogin.com',
    'ABCDEFGI.craftlogin.com',
    'ABCDEFGH.craftlogin.com:0',
    'ABCDEFGH.craftlogin.com:65536',
    'ABCDEFGH.craftlogin.com:port',
    'ABCDEFGH.craftlogin.com:25565:25565',
    ' ABCDEFGH.craftlogin.com',
    '\0FML\0forwarded-data',
    'ABCDEFGH.craftlogin.com\n\0FML',
  ])('rejects invalid handshake host %s', (serverHost): void => {
    expect(extractVerificationCode(serverHost, 'craftlogin.com')).toBeNull();
  });
});

describe('isLobbyHost', (): void => {
  it.each([
    ['craftlogin.com', true],
    ['CRAFTLOGIN.COM', true],
    ['craftlogin.com.', true],
    ['craftlogin.com:25565', true],
    ['craftlogin.com\0FML\0', true],
    ['ABCDEFGH.craftlogin.com', false],
    ['login.craftlogin.com', false],
    ['craftlogin.com.evil.example', false],
    ['', false],
  ])('classifies %s as lobby: %s', (serverHost, expected): void => {
    expect(isLobbyHost(serverHost, 'craftlogin.com')).toBe(expected);
  });
});
