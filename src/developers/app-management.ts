import { z } from 'zod';

import type { PrismaClient } from '../generated/prisma/client.js';
import { generateClientSecret, hashClientSecret } from '../oauth/client-secret.js';
import { redirectUriListSchema } from '../oauth/redirect-uri.js';
import { APP_ICON_MAX_BYTES } from './app-icon.js';
import {
  developerRoleSchema,
  developerUuidSchema,
  type DeveloperRole,
} from './developer-repository.js';
import { containsOnlyDisplayCharacters } from './display-text.js';

const appIdSchema = z.uuid();
const VERIFICATION_NOTE_MAX_LENGTH = 500;

/** Validated before persistence so a normalized icon is the only thing stored. */
export const appIconSchema = z.object({
  hash: z.string().regex(/^[0-9a-f]{64}$/u),
  png: z
    .instanceof(Buffer)
    .refine(
      (value): boolean => value.byteLength > 0 && value.byteLength <= APP_ICON_MAX_BYTES,
      'Invalid icon bytes',
    ),
});

export type AppIconInput = z.infer<typeof appIconSchema>;

export type AppVerificationStatus = 'none' | 'requested' | 'verified';

export const appVerificationNoteSchema = z
  .string()
  .min(1)
  .max(VERIFICATION_NOTE_MAX_LENGTH)
  .refine((value): boolean => value === value.trim(), 'Notes cannot have outer whitespace')
  .refine(containsOnlyDisplayCharacters, 'Notes cannot contain control characters');

/** An administrator decision on a pending or existing verification. */
export const appVerificationDecisionSchema = z.enum(['approve', 'reject', 'revoke']);
export type AppVerificationDecision = z.infer<typeof appVerificationDecisionSchema>;

/** `unavailable` means the conditional write matched nothing: the row was missing or already in the requested state. */
export type AppVerificationOutcome = 'applied' | 'unavailable';

export interface ManagedApp {
  readonly clientId: string;
  readonly clientType: 'confidential' | 'public';
  readonly createdAt: string;
  readonly iconHash?: string;
  readonly id: string;
  readonly name: string;
  readonly ownerUuid?: string;
  readonly redirectUris: readonly string[];
  readonly verification: AppVerificationStatus;
  readonly verificationNote?: string;
  readonly verificationRequestedAt?: string;
}

export interface AppManager {
  list(actorUuid: string, actorRole: DeveloperRole): Promise<readonly ManagedApp[]>;
  remove(appId: string, actorUuid: string, actorRole: DeveloperRole): Promise<boolean>;
  removeIcon(appId: string, actorUuid: string, actorRole: DeveloperRole): Promise<boolean>;
  /**
   * Replaces the exact-match redirect URI list. Returns false when the row is
   * missing or the actor may not manage it.
   */
  updateRedirectUris(
    appId: string,
    actorUuid: string,
    actorRole: DeveloperRole,
    redirectUris: readonly string[],
  ): Promise<boolean>;
  /**
   * Rotates the confidential-client secret and returns the new plaintext once.
   * Undefined means the row was missing, unmanaged, or a public client.
   */
  resetSecret(
    appId: string,
    actorUuid: string,
    actorRole: DeveloperRole,
  ): Promise<string | undefined>;
  requestVerification(
    appId: string,
    actorUuid: string,
    note: string | undefined,
  ): Promise<AppVerificationOutcome>;
  decideVerification(
    appId: string,
    decision: AppVerificationDecision,
  ): Promise<AppVerificationOutcome>;
  setIcon(
    appId: string,
    actorUuid: string,
    actorRole: DeveloperRole,
    icon: AppIconInput,
  ): Promise<boolean>;
}

export class PrismaAppManager implements AppManager {
  public constructor(private readonly database: PrismaClient) {}

  public async list(actorUuid: string, actorRole: DeveloperRole): Promise<readonly ManagedApp[]> {
    const uuid = developerUuidSchema.parse(actorUuid);
    const role = developerRoleSchema.parse(actorRole);
    const where = role === 'admin' ? {} : { ownerUuid: uuid };
    const apps = await this.database.app.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      // Lists never load icon blobs; the hash suffices for the preview URL.
      select: {
        clientId: true,
        clientSecretHash: true,
        createdAt: true,
        iconHash: true,
        id: true,
        name: true,
        ownerUuid: true,
        redirectUris: true,
        verificationNote: true,
        verificationRequestedAt: true,
        verifiedAt: true,
      },
      where,
    });

    return apps.map(toManagedApp);
  }

  public async setIcon(
    appId: string,
    actorUuid: string,
    actorRole: DeveloperRole,
    icon: AppIconInput,
  ): Promise<boolean> {
    const id = appIdSchema.parse(appId);
    const uuid = developerUuidSchema.parse(actorUuid);
    const role = developerRoleSchema.parse(actorRole);
    const parsedIcon = appIconSchema.parse(icon);
    const updated = await this.database.app.updateMany({
      data: { iconHash: parsedIcon.hash, iconPng: Uint8Array.from(parsedIcon.png) },
      where: { id, ...(role === 'admin' ? {} : { ownerUuid: uuid }) },
    });
    return updated.count === 1;
  }

  public async removeIcon(
    appId: string,
    actorUuid: string,
    actorRole: DeveloperRole,
  ): Promise<boolean> {
    const id = appIdSchema.parse(appId);
    const uuid = developerUuidSchema.parse(actorUuid);
    const role = developerRoleSchema.parse(actorRole);
    // The iconPng condition makes a double removal a no-op.
    const updated = await this.database.app.updateMany({
      data: { iconHash: null, iconPng: null },
      where: {
        iconPng: { not: null },
        id,
        ...(role === 'admin' ? {} : { ownerUuid: uuid }),
      },
    });
    return updated.count === 1;
  }

  public async remove(
    appId: string,
    actorUuid: string,
    actorRole: DeveloperRole,
  ): Promise<boolean> {
    const id = appIdSchema.parse(appId);
    const uuid = developerUuidSchema.parse(actorUuid);
    const role = developerRoleSchema.parse(actorRole);
    const removed = await this.database.app.deleteMany({
      where: {
        id,
        ...(role === 'admin' ? {} : { ownerUuid: uuid }),
      },
    });
    return removed.count === 1;
  }

  public async updateRedirectUris(
    appId: string,
    actorUuid: string,
    actorRole: DeveloperRole,
    redirectUris: readonly string[],
  ): Promise<boolean> {
    const id = appIdSchema.parse(appId);
    const uuid = developerUuidSchema.parse(actorUuid);
    const role = developerRoleSchema.parse(actorRole);
    const uris = redirectUriListSchema.parse(redirectUris);
    const updated = await this.database.app.updateMany({
      data: { redirectUris: uris },
      where: { id, ...(role === 'admin' ? {} : { ownerUuid: uuid }) },
    });
    return updated.count === 1;
  }

  public async resetSecret(
    appId: string,
    actorUuid: string,
    actorRole: DeveloperRole,
  ): Promise<string | undefined> {
    const id = appIdSchema.parse(appId);
    const uuid = developerUuidSchema.parse(actorUuid);
    const role = developerRoleSchema.parse(actorRole);
    const clientSecret = generateClientSecret();
    const clientSecretHash = await hashClientSecret(clientSecret);
    // The secret-hash condition keeps a public client public: it can never
    // gain a secret through the rotation path.
    const updated = await this.database.app.updateMany({
      data: { clientSecretHash },
      where: {
        clientSecretHash: { not: null },
        id,
        ...(role === 'admin' ? {} : { ownerUuid: uuid }),
      },
    });
    return updated.count === 1 ? clientSecret : undefined;
  }

  public async requestVerification(
    appId: string,
    actorUuid: string,
    note: string | undefined,
  ): Promise<AppVerificationOutcome> {
    const id = appIdSchema.parse(appId);
    const owner = developerUuidSchema.parse(actorUuid);
    const parsedNote = note === undefined ? null : appVerificationNoteSchema.parse(note);
    // The condition lives in the write so concurrent requests can't both claim
    // the queue slot or overwrite a fresh admin decision.
    const requested = await this.database.app.updateMany({
      data: { verificationNote: parsedNote, verificationRequestedAt: new Date() },
      where: { id, ownerUuid: owner, verificationRequestedAt: null, verifiedAt: null },
    });
    return requested.count === 1 ? 'applied' : 'unavailable';
  }

  public async decideVerification(
    appId: string,
    decision: AppVerificationDecision,
  ): Promise<AppVerificationOutcome> {
    const id = appIdSchema.parse(appId);
    const parsedDecision = appVerificationDecisionSchema.parse(decision);
    // An exact starting state keeps a stale console page from re-deciding an application.
    const decisionWrite = verificationWrite(parsedDecision);
    const decided = await this.database.app.updateMany({
      data: decisionWrite.data,
      where: { id, ...decisionWrite.where },
    });
    return decided.count === 1 ? 'applied' : 'unavailable';
  }
}

interface VerificationWrite {
  readonly data: {
    readonly verificationNote: null;
    readonly verificationRequestedAt: Date | null;
    readonly verifiedAt: Date | null;
  };
  readonly where: {
    readonly verificationRequestedAt?: { readonly not: null };
    readonly verifiedAt: Date | null | { readonly not: null };
  };
}

function verificationWrite(decision: AppVerificationDecision): VerificationWrite {
  if (decision === 'approve') {
    return {
      data: { verificationNote: null, verificationRequestedAt: null, verifiedAt: new Date() },
      where: { verifiedAt: null },
    };
  }
  if (decision === 'reject') {
    return {
      data: { verificationNote: null, verificationRequestedAt: null, verifiedAt: null },
      where: { verificationRequestedAt: { not: null }, verifiedAt: null },
    };
  }
  return {
    data: { verificationNote: null, verificationRequestedAt: null, verifiedAt: null },
    where: { verifiedAt: { not: null } },
  };
}

interface StoredApp {
  readonly clientId: string;
  readonly clientSecretHash: string | null;
  readonly createdAt: Date;
  readonly iconHash: string | null;
  readonly id: string;
  readonly name: string;
  readonly ownerUuid: string | null;
  readonly redirectUris: readonly string[];
  readonly verificationNote: string | null;
  readonly verificationRequestedAt: Date | null;
  readonly verifiedAt: Date | null;
}

function toManagedApp(app: StoredApp): ManagedApp {
  return {
    clientId: app.clientId,
    clientType: app.clientSecretHash === null ? 'public' : 'confidential',
    createdAt: app.createdAt.toISOString(),
    ...(app.iconHash === null ? {} : { iconHash: app.iconHash }),
    id: app.id,
    name: app.name,
    ...(app.ownerUuid === null ? {} : { ownerUuid: app.ownerUuid }),
    redirectUris: app.redirectUris,
    verification: verificationStatusOf(app),
    ...(app.verificationNote === null ? {} : { verificationNote: app.verificationNote }),
    ...(app.verificationRequestedAt === null
      ? {}
      : { verificationRequestedAt: app.verificationRequestedAt.toISOString() }),
  };
}

function verificationStatusOf(app: StoredApp): AppVerificationStatus {
  if (app.verifiedAt !== null) {
    return 'verified';
  }
  return app.verificationRequestedAt === null ? 'none' : 'requested';
}
