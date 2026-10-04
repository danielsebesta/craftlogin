import { randomInt } from 'node:crypto';

import { verificationCodeSchema } from './types.js';

export const VERIFICATION_CODE_LENGTH = 8;
export const VERIFICATION_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// Shown only inside the encrypted post-login channel; six characters stay
// transcribable while the per-record attempt bound keeps guessing infeasible.
export const CONFIRMATION_CODE_LENGTH = 6;

export function generateVerificationCode(): string {
  return verificationCodeSchema.parse(generateAlphabetCode(VERIFICATION_CODE_LENGTH));
}

export function generateConfirmationCode(): string {
  return generateAlphabetCode(CONFIRMATION_CODE_LENGTH);
}

function generateAlphabetCode(length: number): string {
  let code = '';

  for (let index = 0; index < length; index += 1) {
    const character = VERIFICATION_CODE_ALPHABET.at(randomInt(VERIFICATION_CODE_ALPHABET.length));

    if (character === undefined) {
      throw new Error('Verification code alphabet lookup failed');
    }

    code += character;
  }

  return code;
}
