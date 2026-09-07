import { createHash, randomUUID } from 'node:crypto';

import type { Redis } from 'ioredis';
import { z } from 'zod';

import { generateVerificationCode } from './code.js';
import {
  authenticatedMinecraftPlayerSchema,
  interactionIdSchema,
  type AuthenticatedMinecraftPlayer,
  type VerificationStatus,
  verificationCodeSchema,
} from './types.js';

const VERIFICATION_TTL_MS = 5 * 60 * 1_000;
const PROCESSING_TTL_MS = 60 * 1_000;
const RESOLVED_TTL_MS = 5 * 60 * 1_000;
const MAX_CODE_ALLOCATION_ATTEMPTS = 12;
const KEY_ID_PATTERN = /^[0-9a-f]{64}$/u;

const createResultSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const scriptBooleanSchema = z.union([z.literal(0), z.literal(1)]);
const keyIdSchema = z.string().regex(KEY_ID_PATTERN);
const verifiedClaimResultSchema = z.union([
  z.tuple([]),
  z.tuple([
    authenticatedMinecraftPlayerSchema.shape.uuid,
    authenticatedMinecraftPlayerSchema.shape.username,
    z.iso.datetime({ offset: true }),
  ]),
]);
const storedStateSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('pending'),
    code: verificationCodeSchema,
  }),
  z.object({
    status: z.literal('processing'),
  }),
  z.object({
    status: z.literal('verified'),
    userUuid: authenticatedMinecraftPlayerSchema.shape.uuid,
    username: authenticatedMinecraftPlayerSchema.shape.username,
    resolvedAt: z.iso.datetime({ offset: true }),
  }),
  z.object({
    status: z.literal('finalizing'),
    userUuid: authenticatedMinecraftPlayerSchema.shape.uuid,
    username: authenticatedMinecraftPlayerSchema.shape.username,
    resolvedAt: z.iso.datetime({ offset: true }),
  }),
]);

const CREATE_PENDING_SCRIPT = `
if redis.call('EXISTS', KEYS[2]) == 1 then
  return 2
end
if redis.call('EXISTS', KEYS[1]) == 1 then
  return 0
end
local redisTime = redis.call('TIME')
local nowMilliseconds = (redisTime[1] * 1000) + math.floor(redisTime[2] / 1000)
local expiresAt = nowMilliseconds + tonumber(ARGV[3])
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[3])
redis.call('HSET', KEYS[2], 'status', 'pending', 'code', ARGV[2], 'expiresAt', expiresAt)
redis.call('PEXPIRE', KEYS[2], ARGV[3])
return 1
`;

const IS_PENDING_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
if redis.call('HGET', KEYS[2], 'status') ~= 'pending' then
  return 0
end
return 1
`;

const CLAIM_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
if redis.call('HGET', KEYS[2], 'status') ~= 'pending' then
  return 0
end
local remainingTtl = redis.call('PTTL', KEYS[2])
if remainingTtl <= 0 then
  redis.call('DEL', KEYS[1], KEYS[2])
  return 0
end
redis.call('HSET', KEYS[2], 'status', 'processing', 'claimId', ARGV[2])
redis.call('HDEL', KEYS[2], 'code')
if remainingTtl < tonumber(ARGV[3]) then
  redis.call('PEXPIRE', KEYS[2], ARGV[3])
end
return 1
`;

const COMPLETE_SCRIPT = `
if redis.call('HGET', KEYS[2], 'status') ~= 'processing' then
  return 0
end
if redis.call('HGET', KEYS[2], 'claimId') ~= ARGV[2] then
  return 0
end
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('DEL', KEYS[1])
end
redis.call(
  'HSET',
  KEYS[2],
  'status', 'verified',
  'userUuid', ARGV[3],
  'username', ARGV[4],
  'resolvedAt', ARGV[5]
)
redis.call('HDEL', KEYS[2], 'claimId', 'expiresAt')
redis.call('PEXPIRE', KEYS[2], ARGV[6])
return 1
`;

const RELEASE_SCRIPT = `
if redis.call('HGET', KEYS[2], 'status') ~= 'processing' then
  return 0
end
if redis.call('HGET', KEYS[2], 'claimId') ~= ARGV[2] then
  return 0
end
local expiresAt = tonumber(redis.call('HGET', KEYS[2], 'expiresAt'))
local redisTime = redis.call('TIME')
local nowMilliseconds = (redisTime[1] * 1000) + math.floor(redisTime[2] / 1000)
if expiresAt == nil or expiresAt <= nowMilliseconds then
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    redis.call('DEL', KEYS[1])
  end
  redis.call('DEL', KEYS[2])
  return 0
end
local currentCodeOwner = redis.call('GET', KEYS[1])
if currentCodeOwner ~= false and currentCodeOwner ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1], 'PXAT', expiresAt)
redis.call('HSET', KEYS[2], 'status', 'pending', 'code', ARGV[3])
redis.call('HDEL', KEYS[2], 'claimId')
redis.call('PEXPIREAT', KEYS[2], expiresAt)
return 1
`;

const CLAIM_VERIFIED_SCRIPT = `
if redis.call('HGET', KEYS[1], 'status') ~= 'verified' then
  return {}
end
local remainingTtl = redis.call('PTTL', KEYS[1])
if remainingTtl <= 0 then
  redis.call('DEL', KEYS[1])
  return {}
end
local userUuid = redis.call('HGET', KEYS[1], 'userUuid')
local username = redis.call('HGET', KEYS[1], 'username')
local resolvedAt = redis.call('HGET', KEYS[1], 'resolvedAt')
if userUuid == false or username == false or resolvedAt == false then
  return {}
end
redis.call('HSET', KEYS[1], 'status', 'finalizing', 'finishClaimId', ARGV[1])
return { userUuid, username, resolvedAt }
`;

const COMPLETE_FINALIZATION_SCRIPT = `
if redis.call('HGET', KEYS[1], 'status') ~= 'finalizing' then
  return 0
end
if redis.call('HGET', KEYS[1], 'finishClaimId') ~= ARGV[1] then
  return 0
end
redis.call('DEL', KEYS[1])
return 1
`;

const RELEASE_FINALIZATION_SCRIPT = `
if redis.call('HGET', KEYS[1], 'status') ~= 'finalizing' then
  return 0
end
if redis.call('HGET', KEYS[1], 'finishClaimId') ~= ARGV[1] then
  return 0
end
redis.call('HSET', KEYS[1], 'status', 'verified')
redis.call('HDEL', KEYS[1], 'finishClaimId')
return 1
`;

export interface VerificationClaim {
  readonly claimId: string;
  readonly code: string;
  readonly codeKey: string;
  readonly interactionKey: string;
  readonly keyId: string;
}

export interface VerificationFinalizationClaim {
  readonly claimId: string;
  readonly interactionKey: string;
  readonly player: AuthenticatedMinecraftPlayer;
  readonly resolvedAt: string;
}

export class VerificationStateError extends Error {
  public override readonly name = 'VerificationStateError';
}

export class RedisVerificationStore {
  public constructor(
    private readonly redis: Pick<Redis, 'eval' | 'get' | 'hgetall'>,
    private readonly keyPrefix = 'craftlogin:verification',
  ) {}

  public async allocate(interactionIdInput: string): Promise<string> {
    const interactionId = interactionIdSchema.parse(interactionIdInput);
    const keyId = this.interactionKeyId(interactionId);
    const interactionKey = this.interactionKey(keyId);

    const existing = await this.getStatus(interactionId);
    if (existing.status === 'pending' && existing.code !== null) {
      return existing.code;
    }
    if (existing.status === 'verified') {
      throw new VerificationStateError('The verification interaction is already resolved');
    }

    for (let attempt = 0; attempt < MAX_CODE_ALLOCATION_ATTEMPTS; attempt += 1) {
      const code = generateVerificationCode();
      const result = createResultSchema.parse(
        await this.redis.eval(
          CREATE_PENDING_SCRIPT,
          2,
          this.codeKey(code),
          interactionKey,
          keyId,
          code,
          VERIFICATION_TTL_MS,
        ),
      );

      if (result === 1) {
        return code;
      }
      if (result === 2) {
        const concurrentlyCreated = await this.getStatus(interactionId);
        if (concurrentlyCreated.status === 'pending' && concurrentlyCreated.code !== null) {
          return concurrentlyCreated.code;
        }
        throw new VerificationStateError('The verification interaction cannot be allocated');
      }
    }

    throw new VerificationStateError('A unique verification code could not be allocated');
  }

  public async hasPendingCode(codeInput: string): Promise<boolean> {
    const code = verificationCodeSchema.parse(codeInput);
    const codeKey = this.codeKey(code);
    const rawKeyId = await this.redis.get(codeKey);
    const parsedKeyId = keyIdSchema.safeParse(rawKeyId);

    if (!parsedKeyId.success) {
      return false;
    }

    const result = scriptBooleanSchema.parse(
      await this.redis.eval(
        IS_PENDING_SCRIPT,
        2,
        codeKey,
        this.interactionKey(parsedKeyId.data),
        parsedKeyId.data,
      ),
    );

    return result === 1;
  }

  public async claim(codeInput: string): Promise<VerificationClaim | null> {
    const code = verificationCodeSchema.parse(codeInput);
    const codeKey = this.codeKey(code);
    const rawKeyId = await this.redis.get(codeKey);
    const parsedKeyId = keyIdSchema.safeParse(rawKeyId);

    if (!parsedKeyId.success) {
      return null;
    }

    const claimId = randomUUID();
    const interactionKey = this.interactionKey(parsedKeyId.data);
    const result = scriptBooleanSchema.parse(
      await this.redis.eval(
        CLAIM_SCRIPT,
        2,
        codeKey,
        interactionKey,
        parsedKeyId.data,
        claimId,
        PROCESSING_TTL_MS,
      ),
    );

    if (result === 0) {
      return null;
    }

    return {
      claimId,
      code,
      codeKey,
      interactionKey,
      keyId: parsedKeyId.data,
    };
  }

  public async complete(
    claim: VerificationClaim,
    playerInput: AuthenticatedMinecraftPlayer,
    resolvedAt: Date,
  ): Promise<boolean> {
    const player = authenticatedMinecraftPlayerSchema.parse(playerInput);
    const result = scriptBooleanSchema.parse(
      await this.redis.eval(
        COMPLETE_SCRIPT,
        2,
        claim.codeKey,
        claim.interactionKey,
        claim.keyId,
        claim.claimId,
        player.uuid,
        player.username,
        resolvedAt.toISOString(),
        RESOLVED_TTL_MS,
      ),
    );

    return result === 1;
  }

  public async release(claim: VerificationClaim): Promise<boolean> {
    const result = scriptBooleanSchema.parse(
      await this.redis.eval(
        RELEASE_SCRIPT,
        2,
        claim.codeKey,
        claim.interactionKey,
        claim.keyId,
        claim.claimId,
        claim.code,
      ),
    );

    return result === 1;
  }

  public async claimVerified(
    interactionIdInput: string,
  ): Promise<VerificationFinalizationClaim | null> {
    const interactionId = interactionIdSchema.parse(interactionIdInput);
    const interactionKey = this.interactionKey(this.interactionKeyId(interactionId));
    const claimId = randomUUID();
    const result = verifiedClaimResultSchema.parse(
      await this.redis.eval(CLAIM_VERIFIED_SCRIPT, 1, interactionKey, claimId),
    );

    if (result.length === 0) {
      return null;
    }

    const [uuid, username, resolvedAt] = result;
    return {
      claimId,
      interactionKey,
      player: { uuid, username },
      resolvedAt,
    };
  }

  public async completeFinalization(claim: VerificationFinalizationClaim): Promise<boolean> {
    const result = scriptBooleanSchema.parse(
      await this.redis.eval(COMPLETE_FINALIZATION_SCRIPT, 1, claim.interactionKey, claim.claimId),
    );
    return result === 1;
  }

  public async releaseFinalization(claim: VerificationFinalizationClaim): Promise<boolean> {
    const result = scriptBooleanSchema.parse(
      await this.redis.eval(RELEASE_FINALIZATION_SCRIPT, 1, claim.interactionKey, claim.claimId),
    );
    return result === 1;
  }

  public async getStatus(interactionIdInput: string): Promise<VerificationStatus> {
    const interactionId = interactionIdSchema.parse(interactionIdInput);
    const stored = await this.redis.hgetall(
      this.interactionKey(this.interactionKeyId(interactionId)),
    );

    if (Object.keys(stored).length === 0) {
      return { status: 'expired' };
    }

    const parsed = storedStateSchema.safeParse(stored);
    if (!parsed.success) {
      throw new VerificationStateError('The verification interaction state is invalid');
    }

    if (parsed.data.status === 'pending') {
      return { status: 'pending', code: parsed.data.code };
    }
    if (parsed.data.status === 'processing') {
      return { status: 'pending', code: null };
    }

    return {
      status: 'verified',
      player: {
        uuid: parsed.data.userUuid,
        username: parsed.data.username,
      },
      resolvedAt: parsed.data.resolvedAt,
    };
  }

  private codeKey(code: string): string {
    return `${this.keyPrefix}:code:${code}`;
  }

  private interactionKey(keyId: string): string {
    return `${this.keyPrefix}:interaction:${keyId}`;
  }

  private interactionKeyId(interactionId: string): string {
    return createHash('sha256').update(interactionId, 'utf8').digest('hex');
  }
}
