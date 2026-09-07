import { randomInt } from 'node:crypto';

import { verificationCodeSchema } from './types.js';

export const VERIFICATION_CODE_LENGTH = 8;
export const VERIFICATION_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateVerificationCode(): string {
  let code = '';

  for (let index = 0; index < VERIFICATION_CODE_LENGTH; index += 1) {
    const character = VERIFICATION_CODE_ALPHABET.at(randomInt(VERIFICATION_CODE_ALPHABET.length));

    if (character === undefined) {
      throw new Error('Verification code alphabet lookup failed');
    }

    code += character;
  }

  return verificationCodeSchema.parse(code);
}
