import { createHash, randomBytes } from 'node:crypto';

import type { Redis } from 'ioredis';
import { z } from 'zod';

import {
  SESSION_ABSOLUTE_TTL_SECONDS,
  SESSION_SLIDING_TTL_SECONDS,
} from '../oauth/session-security.js';
import { developerRoleSchema, developerUuidSchema } from './developer-repository.js';

const SESSION_ID_SCHEMA = z.string().regex(/^ds_[A-Za-z0-9_-]{43}$/u);
const SESSION_KEY_ID_SCHEMA = z.string().regex(/^[0-9a-f]{64}$/u);
const MAX_SESSION_ALLOCATION_ATTEMPTS = 4;
const CREATE_RESULT_SCHEMA = z.union([z.literal(0), z.literal(1)]);
const READ_RESULT_SCHEMA = z.union([
  z.tuple([]),
  z.tuple([z.string(), z.union([z.number().int().positive(), z.string().regex(/^\d+$/u)])]),
]);
const ROTATE_RESULT_SCHEMA = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const LIST_RESULT_SCHEMA = z.array(z.string());

// Records written before network fingerprinting carry an ipAddress key but no
// ipReference; the default marks them incomparable until they expire.
const storedSessionSchema = z.object({
  ipReference: z.string().min(1).max(128).default('unknown'),
  issuedAtMilliseconds: z.number().int().nonnegative(),
  role: developerRoleSchema,
  userAgent: z.string().min(1).max(512),
  userUuid: developerUuidSchema,
});

const listedSessionSchema = storedSessionSchema.extend({
  sessionKeyId: z.string(),
  ttlMilliseconds: z.number(),
});

// Sessions are indexed per user so the console can list and revoke them. The
// index stores key IDs (session-id hashes), never raw session identifiers.
const CREATE_SESSION_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
redis.call('SADD', KEYS[2], ARGV[3])
redis.call('PEXPIRE', KEYS[2], ARGV[4])
return 1
`;

const READ_SESSION_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if raw == false then
  return {}
end
local record = cjson.decode(raw)
local absoluteRemaining = tonumber(record.issuedAtMilliseconds) + tonumber(ARGV[2]) - tonumber(ARGV[1])
if absoluteRemaining <= 0 then
  redis.call('DEL', KEYS[1])
  redis.call('SREM', ARGV[4] .. record.userUuid, ARGV[5])
  return {}
end
local ttl = math.min(tonumber(ARGV[3]), absoluteRemaining)
redis.call('PEXPIRE', KEYS[1], ttl)
redis.call('PEXPIRE', ARGV[4] .. record.userUuid, ttl)
return { raw, ttl }
`;

const ROTATE_SESSION_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if raw == false then
  return 0
end
if redis.call('EXISTS', KEYS[2]) == 1 then
  return 2
end
local record = cjson.decode(raw)
local absoluteRemaining = tonumber(record.issuedAtMilliseconds) + tonumber(ARGV[3]) - tonumber(ARGV[2])
if absoluteRemaining <= 0 then
  redis.call('DEL', KEYS[1])
  redis.call('SREM', ARGV[5] .. record.userUuid, ARGV[6])
  return 0
end
record.role = ARGV[1]
local ttl = math.min(tonumber(ARGV[4]), absoluteRemaining)
redis.call('DEL', KEYS[1])
redis.call('SET', KEYS[2], cjson.encode(record), 'PX', ttl)
local indexKey = ARGV[5] .. record.userUuid
redis.call('SREM', indexKey, ARGV[6])
redis.call('SADD', indexKey, ARGV[7])
redis.call('PEXPIRE', indexKey, ttl)
return 1
`;

const REVOKE_SESSION_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if raw == false then
  return 0
end
local record = cjson.decode(raw)
redis.call('DEL', KEYS[1])
redis.call('SREM', ARGV[1] .. record.userUuid, ARGV[2])
return 1
`;

const LIST_SESSIONS_SCRIPT = `
local members = redis.call('SMEMBERS', KEYS[1])
local out = {}
for _, keyId in ipairs(members) do
  local sessionKey = ARGV[1] .. keyId
  local raw = redis.call('GET', sessionKey)
  if raw == false then
    redis.call('SREM', KEYS[1], keyId)
  else
    local record = cjson.decode(raw)
    local absoluteRemaining = tonumber(record.issuedAtMilliseconds) + tonumber(ARGV[3]) - tonumber(ARGV[2])
    if absoluteRemaining <= 0 then
      redis.call('DEL', sessionKey)
      redis.call('SREM', KEYS[1], keyId)
    else
      record.sessionKeyId = keyId
      record.ttlMilliseconds = redis.call('PTTL', sessionKey)
      out[#out + 1] = cjson.encode(record)
    end
  end
end
return out
`;

export interface DeveloperSessionRecord {
  readonly expiresInSeconds: number;
  readonly ipReference: string;
  readonly issuedAtMilliseconds: number;
  readonly role: z.infer<typeof developerRoleSchema>;
  readonly sessionId: string;
  readonly userAgent: string;
  readonly userUuid: string;
}

// A listed session is identified by its storage key ID (a session-id hash), so
// neither the UI nor logs ever see a usable session identifier.
export interface DeveloperSessionSummary {
  readonly expiresInSeconds: number;
  readonly ipReference: string;
  readonly issuedAtMilliseconds: number;
  readonly role: z.infer<typeof developerRoleSchema>;
  readonly sessionKeyId: string;
  readonly userAgent: string;
  readonly userUuid: string;
}

interface NewDeveloperSession {
  readonly ipReference: string;
  readonly role: z.infer<typeof developerRoleSchema>;
  readonly userAgent: string;
  readonly userUuid: string;
}

export class RedisDeveloperSessionStore {
  public constructor(
    private readonly redis: Pick<Redis, 'del' | 'eval'>,
    private readonly keyPrefix = 'craftlogin:developer-session',
    private readonly indexPrefix = 'craftlogin:developer-sessions',
  ) {}

  public async create(input: NewDeveloperSession): Promise<DeveloperSessionRecord> {
    const issuedAtMilliseconds = Date.now();
    const stored = storedSessionSchema.parse({ ...input, issuedAtMilliseconds });
    const ttlMilliseconds = SESSION_SLIDING_TTL_SECONDS * 1_000;

    for (let attempt = 0; attempt < MAX_SESSION_ALLOCATION_ATTEMPTS; attempt += 1) {
      const sessionId = `ds_${randomBytes(32).toString('base64url')}`;
      const created = CREATE_RESULT_SCHEMA.parse(
        await this.redis.eval(
          CREATE_SESSION_SCRIPT,
          2,
          this.sessionKey(sessionId),
          this.indexKey(stored.userUuid),
          JSON.stringify(stored),
          ttlMilliseconds,
          this.keyIdFor(sessionId),
          SESSION_ABSOLUTE_TTL_SECONDS * 1_000,
        ),
      );
      if (created === 1) {
        return { ...stored, expiresInSeconds: SESSION_SLIDING_TTL_SECONDS, sessionId };
      }
    }

    throw new Error('A unique developer session identifier could not be allocated');
  }

  public async read(sessionIdInput: string): Promise<DeveloperSessionRecord | undefined> {
    const sessionId = SESSION_ID_SCHEMA.parse(sessionIdInput);
    const result = READ_RESULT_SCHEMA.parse(
      await this.redis.eval(
        READ_SESSION_SCRIPT,
        1,
        this.sessionKey(sessionId),
        Date.now(),
        SESSION_ABSOLUTE_TTL_SECONDS * 1_000,
        SESSION_SLIDING_TTL_SECONDS * 1_000,
        `${this.indexPrefix}:`,
        this.keyIdFor(sessionId),
      ),
    );
    if (result.length === 0) {
      return undefined;
    }

    const stored = parseStoredSession(result[0]);
    const ttlMilliseconds =
      typeof result[1] === 'number' ? result[1] : Number.parseInt(result[1], 10);
    return {
      ...stored,
      expiresInSeconds: Math.max(1, Math.ceil(ttlMilliseconds / 1_000)),
      sessionId,
    };
  }

  public async listForUser(userUuidInput: string): Promise<DeveloperSessionSummary[]> {
    const userUuid = developerUuidSchema.parse(userUuidInput);
    const listed = LIST_RESULT_SCHEMA.parse(
      await this.redis.eval(
        LIST_SESSIONS_SCRIPT,
        1,
        this.indexKey(userUuid),
        `${this.keyPrefix}:`,
        Date.now(),
        SESSION_ABSOLUTE_TTL_SECONDS * 1_000,
      ),
    );
    const summaries: DeveloperSessionSummary[] = [];
    for (const raw of listed) {
      const session = parseListedSession(raw);
      summaries.push({
        expiresInSeconds: Math.max(1, Math.ceil(session.ttlMilliseconds / 1_000)),
        ipReference: session.ipReference,
        issuedAtMilliseconds: session.issuedAtMilliseconds,
        role: session.role,
        sessionKeyId: session.sessionKeyId,
        userAgent: session.userAgent,
        userUuid: session.userUuid,
      });
    }
    return summaries;
  }

  public async revoke(sessionIdInput: string): Promise<void> {
    const sessionId = SESSION_ID_SCHEMA.parse(sessionIdInput);
    await this.revokeKeyId(this.keyIdFor(sessionId));
  }

  public async revokeByKeyId(keyIdInput: string): Promise<void> {
    const keyId = SESSION_KEY_ID_SCHEMA.parse(keyIdInput);
    await this.revokeKeyId(keyId);
  }

  public async rotateRole(
    currentSessionIdInput: string,
    role: z.infer<typeof developerRoleSchema>,
  ): Promise<DeveloperSessionRecord | undefined> {
    const currentSessionId = SESSION_ID_SCHEMA.parse(currentSessionIdInput);
    const parsedRole = developerRoleSchema.parse(role);

    for (let attempt = 0; attempt < MAX_SESSION_ALLOCATION_ATTEMPTS; attempt += 1) {
      const nextSessionId = `ds_${randomBytes(32).toString('base64url')}`;
      const result = ROTATE_RESULT_SCHEMA.parse(
        await this.redis.eval(
          ROTATE_SESSION_SCRIPT,
          2,
          this.sessionKey(currentSessionId),
          this.sessionKey(nextSessionId),
          parsedRole,
          Date.now(),
          SESSION_ABSOLUTE_TTL_SECONDS * 1_000,
          SESSION_SLIDING_TTL_SECONDS * 1_000,
          `${this.indexPrefix}:`,
          this.keyIdFor(currentSessionId),
          this.keyIdFor(nextSessionId),
        ),
      );
      if (result === 0) {
        return undefined;
      }
      if (result === 1) {
        return await this.read(nextSessionId);
      }
    }

    throw new Error('A rotated developer session identifier could not be allocated');
  }

  public keyIdFor(sessionId: string): string {
    return createHash('sha256').update(sessionId, 'utf8').digest('hex');
  }

  private async revokeKeyId(keyId: string): Promise<void> {
    await this.redis.eval(
      REVOKE_SESSION_SCRIPT,
      1,
      `${this.keyPrefix}:${keyId}`,
      `${this.indexPrefix}:`,
      keyId,
    );
  }

  private indexKey(userUuid: string): string {
    return `${this.indexPrefix}:${userUuid}`;
  }

  private sessionKey(sessionId: string): string {
    return `${this.keyPrefix}:${this.keyIdFor(sessionId)}`;
  }
}

function parseStoredSession(raw: string): z.infer<typeof storedSessionSchema> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    throw new Error('The stored developer session is malformed', { cause: error });
  }
  return storedSessionSchema.parse(parsed);
}

function parseListedSession(raw: string): z.infer<typeof listedSessionSchema> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    throw new Error('The listed developer session is malformed', { cause: error });
  }
  return listedSessionSchema.parse(parsed);
}
