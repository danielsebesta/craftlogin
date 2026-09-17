import { z } from 'zod';

import type { PrismaClient } from '../generated/prisma/client.js';
import {
  developerRoleSchema,
  developerUuidSchema,
  type DeveloperRole,
} from './developer-repository.js';
import { containsOnlyDisplayCharacters } from './display-text.js';

const appIdSchema = z.uuid();
const VERIFICATION_NOTE_MAX_LENGTH = 500;

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
  requestVerification(
    appId: string,
    actorUuid: string,
    note: string | undefined,
  ): Promise<AppVerificationOutcome>;
  decideVerification(
    appId: string,
    decision: AppVerificationDecision,
  ): Promise<AppVerificationOutcome>;
}

export class PrismaAppManager implements AppManager {
  public constructor(private readonly database: PrismaClient) {}

  public async list(actorUuid: string, actorRole: DeveloperRole): Promise<readonly ManagedApp[]> {
    const uuid = developerUuidSchema.parse(actorUuid);
    const role = developerRoleSchema.parse(actorRole);
    const where = role === 'admin' ? {} : { ownerUuid: uuid };
    const apps = await this.database.app.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      where,
    });

    return apps.map(toManagedApp);
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

  public async requestVerification(
    appId: string,
    actorUuid: string,
    note: string | undefined,
  ): Promise<AppVerificationOutcome> {
    const id = appIdSchema.parse(appId);
    const owner = developerUuidSchema.parse(actorUuid);
    const parsedNote = note === undefined ? null : appVerificationNoteSchema.parse(note);
    // Only the owner can queue an application, and only while it is neither
    // verified nor already queued. The condition lives in the write so two
    // concurrent requests cannot both claim the queue slot or overwrite a fresh
    // administrator decision that landed in between.
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
    // Each decision requires an exact starting state, so a stale console page
    // cannot approve an application that was already revoked or rejected twice.
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
