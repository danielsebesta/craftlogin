import { describe, expect, it } from 'vitest';

import {
  generateVerificationCode,
  VERIFICATION_CODE_ALPHABET,
  VERIFICATION_CODE_LENGTH,
} from '../../src/verification/code.js';
import { verificationCodeSchema } from '../../src/verification/types.js';

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
