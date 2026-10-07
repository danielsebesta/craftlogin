import { WorkBudget } from '../infrastructure/work-budget.js';
import { randomBytes } from 'node:crypto';

import argon2 from 'argon2';
import { z } from 'zod';

const secretBudget = new WorkBudget(4, 32);

export function generateClientSecret(): string {
  return `cls_${randomBytes(32).toString('base64url')}`;
}

export const clientSecretHashSchema = z
  .string()
  .max(255)
  .regex(/^\$argon2(?:id|i|d)\$v=\d+\$/u);

export async function hashClientSecret(secret: string): Promise<string> {
  return await secretBudget.run(() =>
    argon2.hash(secret, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
    }),
  );
}

export async function verifyClientSecret(hashInput: string, secret: string): Promise<boolean> {
  const hash = clientSecretHashSchema.safeParse(hashInput);
  if (!hash.success) {
    return false;
  }

  try {
    return await secretBudget.run(() => argon2.verify(hash.data, secret));
  } catch {
    return false;
  }
}
