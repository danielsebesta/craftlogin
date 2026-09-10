import { randomBytes } from 'node:crypto';

import { z } from 'zod';

import { developerUuidSchema } from '../developers/developer-repository.js';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { hashClientSecret } from '../oauth/client-secret.js';
import { redirectUriSchema } from '../oauth/redirect-uri.js';

const MAX_CLIENT_ID_ATTEMPTS = 4;
const appRegistrationInputSchema = z
  .object({
    clientType: z.enum(['public', 'confidential']),
    name: z
      .string()
      .min(1)
      .max(100)
      .refine((value): boolean => value === value.trim(), 'App names cannot have outer whitespace')
      .refine(containsOnlyDisplayCharacters, 'App names cannot contain control characters'),
    redirectUris: z
      .array(redirectUriSchema)
      .min(1)
      .max(20)
      .refine(
        (values): boolean => new Set(values).size === values.length,
        'Redirect URIs must be unique',
      ),
  })
  .strict();

export type AppRegistrationInput = z.infer<typeof appRegistrationInputSchema>;

export interface RegisteredApp {
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly clientType: 'confidential' | 'public';
  readonly createdAt: string;
  readonly id: string;
  readonly name: string;
  readonly redirectUris: readonly string[];
}

export interface AppRegistrar {
  register(input: AppRegistrationInput, ownerUuid: string): Promise<RegisteredApp>;
}

export function parseAppRegistrationInput(input: unknown): AppRegistrationInput {
  return appRegistrationInputSchema.parse(input);
}

export class PrismaAppRegistrar implements AppRegistrar {
  public constructor(private readonly database: PrismaClient) {}

  public async register(input: AppRegistrationInput, ownerUuid: string): Promise<RegisteredApp> {
    const registration = parseAppRegistrationInput(input);
    const owner = developerUuidSchema.parse(ownerUuid);
    const clientSecret =
      registration.clientType === 'confidential'
        ? `cls_${randomBytes(32).toString('base64url')}`
        : undefined;
    const clientSecretHash =
      clientSecret === undefined ? null : await hashClientSecret(clientSecret);

    for (let attempt = 0; attempt < MAX_CLIENT_ID_ATTEMPTS; attempt += 1) {
      const clientId = `cl_${randomBytes(24).toString('base64url')}`;
      try {
        const created = await this.database.app.create({
          data: {
            clientId,
            clientSecretHash,
            name: registration.name,
            ownerUuid: owner,
            redirectUris: registration.redirectUris,
          },
          select: {
            createdAt: true,
            id: true,
          },
        });

        return clientSecret === undefined
          ? {
              clientId,
              clientType: 'public',
              createdAt: created.createdAt.toISOString(),
              id: created.id,
              name: registration.name,
              redirectUris: registration.redirectUris,
            }
          : {
              clientId,
              clientSecret,
              clientType: 'confidential',
              createdAt: created.createdAt.toISOString(),
              id: created.id,
              name: registration.name,
              redirectUris: registration.redirectUris,
            };
      } catch (error: unknown) {
        if (!isClientIdCollision(error)) {
          throw error;
        }
      }
    }

    throw new Error('A unique OAuth client id could not be allocated');
  }
}

function isClientIdCollision(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function containsOnlyDisplayCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      return false;
    }
  }
  return true;
}
