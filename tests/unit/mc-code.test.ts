import { describe, expect, it } from 'vitest';

import { extractChatCode } from '../../src/mc-server/chat-code.js';
import { extractVerificationCode, isLobbyHost } from '../../src/mc-server/hostname.js';
import {
  generateVerificationCode,
  VERIFICATION_CODE_ALPHABET,
  VERIFICATION_CODE_LENGTH,
} from '../../src/verification/code.js';
import { verificationCodeSchema } from '../../src/verification/types.js';

const BASE_DOMAIN = 'craftlogin.com';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const FUZZ_ITERATIONS = 2_000;

// Deterministic PRNG (mulberry32): fuzz inputs must be reproducible, so a
// failing case is stable across runs and machines.
function createRng(seed: number): () => number {
  let state = seed;
  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomCode(rng: () => number): string {
  let code = '';
  for (let index = 0; index < 8; index += 1) {
    code += CODE_ALPHABET.charAt(Math.floor(rng() * CODE_ALPHABET.length));
  }
  return code;
}

const FUZZ_CHARSET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_:\0 /\\\t\n\r~!@#$%^&*()[]{}';

function randomHostLike(rng: () => number, maxLength: number): string {
  const length = Math.floor(rng() * maxLength);
  let text = '';
  for (let index = 0; index < length; index += 1) {
    text += FUZZ_CHARSET.charAt(Math.floor(rng() * FUZZ_CHARSET.length));
  }
  return text;
}

describe('generateVerificationCode', (): void => {
  it('generates short codes from the unambiguous alphabet', (): void => {
    for (let index = 0; index < 128; index += 1) {
      const code = generateVerificationCode();

      expect(code).toHaveLength(VERIFICATION_CODE_LENGTH);
      expect(verificationCodeSchema.safeParse(code).success).toBe(true);
      expect(code).toMatch(new RegExp(`^[${VERIFICATION_CODE_ALPHABET}]+$`, 'u'));
      expect(code).not.toMatch(/[01ILO]/u);
    }
  });
});

describe('extractVerificationCode', (): void => {
  it('extracts codes from every valid handshake host form', (): void => {
    const cases: readonly [string, string][] = [
      ['ABCDEFGH.craftlogin.com', 'ABCDEFGH'],
      ['abcdefgh.craftlogin.com', 'ABCDEFGH'],
      ['ABCDEFGH.CRAFTLOGIN.COM', 'ABCDEFGH'],
      ['ABCDEFGH.craftlogin.com.', 'ABCDEFGH'],
      ['ABCDEFGH.craftlogin.com:25565', 'ABCDEFGH'],
      ['ABCDEFGH.craftlogin.com.:25565', 'ABCDEFGH'],
      ['ABCDEFGH.craftlogin.com\0FML\0', 'ABCDEFGH'],
      ['ABCDEFGH.craftlogin.com:25565\0FML2\0forwarded-data', 'ABCDEFGH'],
    ];
    for (const [serverHost, expected] of cases) {
      expect(extractVerificationCode(serverHost, BASE_DOMAIN), serverHost).toBe(expected);
    }
  });

  it('rejects invalid handshake hosts', (): void => {
    const cases: readonly string[] = [
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
    ];
    for (const serverHost of cases) {
      expect(extractVerificationCode(serverHost, BASE_DOMAIN), serverHost).toBeNull();
    }
  });
});

describe('isLobbyHost', (): void => {
  it('classifies only the bare base domain as the lobby', (): void => {
    const cases: readonly [string, boolean][] = [
      ['craftlogin.com', true],
      ['CRAFTLOGIN.COM', true],
      ['craftlogin.com.', true],
      ['craftlogin.com:25565', true],
      ['craftlogin.com\0FML\0', true],
      ['ABCDEFGH.craftlogin.com', false],
      ['login.craftlogin.com', false],
      ['craftlogin.com.evil.example', false],
      ['', false],
    ];
    for (const [serverHost, expected] of cases) {
      expect(isLobbyHost(serverHost, BASE_DOMAIN), serverHost).toBe(expected);
    }
  });
});

describe('lobby chat code extraction', (): void => {
  it('accepts bare, pasted, and verify-command forms', (): void => {
    const cases: readonly [string, string][] = [
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
    ];
    for (const [message, expected] of cases) {
      expect(extractChatCode(message, BASE_DOMAIN), message).toBe(expected);
    }
  });

  it('rejects chat that is not exactly one code', (): void => {
    const cases: readonly string[] = [
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
    ];
    for (const message of cases) {
      expect(extractChatCode(message, BASE_DOMAIN), message).toBeNull();
    }
  });
});

describe('handshake hostname fuzz', (): void => {
  it('never throws and only yields schema-valid codes on arbitrary input', (): void => {
    const rng = createRng(0x5eed01);
    for (let index = 0; index < FUZZ_ITERATIONS; index += 1) {
      const input = randomHostLike(rng, 600);
      const extracted = extractVerificationCode(input, BASE_DOMAIN);
      if (extracted !== null) {
        expect(verificationCodeSchema.safeParse(extracted).success).toBe(true);
      }
      expect(typeof isLobbyHost(input, BASE_DOMAIN)).toBe('boolean');
    }
  });

  it('round-trips every valid code through subdomain, port, dot, and Forge suffix forms', (): void => {
    const rng = createRng(0x5eed02);
    for (let index = 0; index < 500; index += 1) {
      const code = randomCode(rng);
      const forms = [
        `${code}.${BASE_DOMAIN}`,
        `${code.toLowerCase()}.${BASE_DOMAIN}`,
        `${code}.${BASE_DOMAIN}.`,
        `${code}.${BASE_DOMAIN}:25565`,
        `${code}.${BASE_DOMAIN}\0FORGE\0metadata`,
        `${code}.${BASE_DOMAIN}:1`,
      ];
      for (const host of forms) {
        expect(extractVerificationCode(host, BASE_DOMAIN)).toBe(code);
      }
      expect(isLobbyHost(BASE_DOMAIN, BASE_DOMAIN)).toBe(true);
      expect(isLobbyHost(`${code}.${BASE_DOMAIN}`, BASE_DOMAIN)).toBe(false);
    }
  });

  it('rejects look-alike base domains and oversized inputs', (): void => {
    const rng = createRng(0x5eed03);
    for (let index = 0; index < 500; index += 1) {
      const code = randomCode(rng);
      const lookalikes = [
        `${code}.evilcraftlogin.com`,
        `${code}.${BASE_DOMAIN}.evil.example`,
        `${code}.craftlogin.com.example`,
        `${code}x.${BASE_DOMAIN}`,
        `${code.slice(0, 7)}.${BASE_DOMAIN}`,
        `${code}9.${BASE_DOMAIN}`,
        `${code}.${BASE_DOMAIN}:0`,
        `${code}.${BASE_DOMAIN}:65536`,
        `${'a'.repeat(300)}.${BASE_DOMAIN}`,
      ];
      for (const host of lookalikes) {
        expect(extractVerificationCode(host, BASE_DOMAIN)).toBeNull();
      }
      expect(isLobbyHost(`${code}.${BASE_DOMAIN}.evil.example`, BASE_DOMAIN)).toBe(false);
    }
    expect(extractVerificationCode('x'.repeat(100_000), BASE_DOMAIN)).toBeNull();
    expect(isLobbyHost('x'.repeat(100_000), BASE_DOMAIN)).toBe(false);
  });
});

describe('lobby chat fuzz', (): void => {
  it('never throws and only yields schema-valid codes on arbitrary input', (): void => {
    const rng = createRng(0x5eed04);
    for (let index = 0; index < FUZZ_ITERATIONS; index += 1) {
      const extracted = extractChatCode(randomHostLike(rng, 400), BASE_DOMAIN);
      if (extracted !== null) {
        expect(verificationCodeSchema.safeParse(extracted).success).toBe(true);
      }
    }
  });

  it('accepts bare, pasted-subdomain, and verify-command forms for valid codes', (): void => {
    const rng = createRng(0x5eed05);
    for (let index = 0; index < 500; index += 1) {
      const code = randomCode(rng);
      const accepted = [
        code,
        code.toLowerCase(),
        ` ${code} `,
        `${code}.${BASE_DOMAIN}`,
        `verify ${code}`,
        `/verify ${code}`,
        `/verify ${code}.${BASE_DOMAIN}`,
        `VERIFY  ${code.toLowerCase()} `,
      ];
      for (const message of accepted) {
        expect(extractChatCode(message, BASE_DOMAIN)).toBe(code);
      }
    }
  });

  it('rejects chat that embeds a code inside other text', (): void => {
    const rng = createRng(0x5eed06);
    for (let index = 0; index < 500; index += 1) {
      const code = randomCode(rng);
      const rejected = [
        `hello ${code} there`,
        `${code}${code}`,
        `verify${code}`,
        `/verify${code}`,
        code.slice(0, 7),
        `verify `,
        `${code}.${BASE_DOMAIN}.${BASE_DOMAIN}`,
      ];
      for (const message of rejected) {
        expect(extractChatCode(message, BASE_DOMAIN)).toBeNull();
      }
    }
    expect(extractChatCode('x'.repeat(100_000), BASE_DOMAIN)).toBeNull();
  });
});
