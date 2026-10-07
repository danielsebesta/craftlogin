import { createHash, randomUUID } from 'node:crypto';

import type { Redis } from 'ioredis';
import { z } from 'zod';

import { generateVerificationCode } from './code.js';
import {
  authenticatedMinecraftPlayerSchema,
  interactionIdSchema,
  type AuthenticatedMinecraftPlayer,
  type VerificationMethod,
  type VerificationStatus,
  verificationCodeSchema,
  verificationMethodSchema,
} from './types.js';

const VERIFICATION_TTL_MS = 5 * 60 * 1_000;
const PROCESSING_TTL_MS = 60 * 1_000;
const RESOLVED_TTL_MS = 5 * 60 * 1_000;
const MAX_CODE_ALLOCATION_ATTEMPTS = 12;
const MAX_CONFIRMATION_ATTEMPTS = 10;
const MAX_CLIENT_NAME_LENGTH = 128;
const KEY_ID_PATTERN = /^[0-9a-f]{64}$/u;
const createResultSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const scriptBooleanSchema = z.union([z.literal(0), z.literal(1)]);
const claimResultSchema = z.union([z.literal(0), z.tuple([z.literal(1), z.string()])]);
const keyIdSchema = z.string().regex(KEY_ID_PATTERN);
const verifiedClaimResultSchema = z.union([
  z.tuple([z.union([z.literal(0), z.literal(2), z.literal(3)])]),
  z.tuple([
    z.literal(1),
    authenticatedMinecraftPlayerSchema.shape.uuid,
    authenticatedMinecraftPlayerSchema.shape.username,
    z.iso.datetime({ offset: true }),
    verificationMethodSchema,
  ]),
]);
const interactionClaimResultSchema = z.union([z.tuple([]), z.tuple([verificationCodeSchema])]);
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
    method: verificationMethodSchema.optional(),
    confirmCode: z.string().optional(),
  }),
  z.object({
    status: z.literal('finalizing'),
    userUuid: authenticatedMinecraftPlayerSchema.shape.uuid,
    username: authenticatedMinecraftPlayerSchema.shape.username,
    resolvedAt: z.iso.datetime({ offset: true }),
    method: verificationMethodSchema.optional(),
    confirmCode: z.string().optional(),
  }),
]);

// The client display name rides along on the record so the in-game kick can
// name the application being signed into; a silent proxy cannot erase that
// warning because it cannot read the encrypted channel it travels on.
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
if ARGV[4] ~= '' then
  redis.call('HSET', KEYS[2], 'clientName', ARGV[4])
end
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
local clientName = redis.call('HGET', KEYS[2], 'clientName')
if clientName == false then
  clientName = ''
end
redis.call('HSET', KEYS[2], 'status', 'processing', 'claimId', ARGV[2])
redis.call('HDEL', KEYS[2], 'code')
redis.call('DEL', KEYS[1])
if remainingTtl < tonumber(ARGV[3]) then
  redis.call('PEXPIRE', KEYS[2], ARGV[3])
end
return { 1, clientName }
`;

const CLAIM_INTERACTION_SCRIPT = `
if #KEYS == 2 then
  if redis.call('HGET', KEYS[2], 'status') ~= 'checking' or
     redis.call('HGET', KEYS[2], 'claimId') ~= ARGV[5] then
    return {}
  end
end
if redis.call('HGET', KEYS[1], 'status') ~= 'pending' then
  return {}
end
local code = redis.call('HGET', KEYS[1], 'code')
if code == false then
  return {}
end
local remainingTtl = redis.call('PTTL', KEYS[1])
if remainingTtl <= 0 then
  redis.call('DEL', KEYS[1])
  return {}
end
local codeKey = ARGV[3] .. code
if redis.call('GET', codeKey) ~= ARGV[1] then
  return {}
end
redis.call('DEL', codeKey)
redis.call('HSET', KEYS[1], 'status', 'processing', 'claimId', ARGV[2])
redis.call('HDEL', KEYS[1], 'code')
if remainingTtl < tonumber(ARGV[4]) then
  redis.call('PEXPIRE', KEYS[1], ARGV[4])
end
return { code }
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
  'resolvedAt', ARGV[5],
  'method', ARGV[6]
)
if ARGV[8] ~= '' then
  redis.call('HSET', KEYS[2], 'confirmCode', ARGV[8])
end
redis.call('HDEL', KEYS[2], 'claimId', 'expiresAt')
redis.call('PEXPIRE', KEYS[2], ARGV[7])
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

// Join-path records carry a confirmation code delivered over the encrypted
// disconnect channel, so finalization requires echoing it back; a relaying
// proxy never sees it. Wrong guesses count toward a bound that discards the
// resolution entirely, so grinding forces a fresh verification.
const CLAIM_VERIFIED_SCRIPT = `
if redis.call('HGET', KEYS[1], 'status') ~= 'verified' then
  return { 0 }
end
local remainingTtl = redis.call('PTTL', KEYS[1])
if remainingTtl <= 0 then
  redis.call('DEL', KEYS[1])
  return { 0 }
end
local confirmCode = redis.call('HGET', KEYS[1], 'confirmCode')
if confirmCode ~= false and confirmCode ~= ARGV[2] then
  local attempts = tonumber(redis.call('HGET', KEYS[1], 'confirmAttempts')) or 0
  attempts = attempts + 1
  if attempts >= tonumber(ARGV[3]) then
    redis.call('DEL', KEYS[1])
    return { 3 }
  end
  redis.call('HSET', KEYS[1], 'confirmAttempts', attempts)
  return { 2 }
end
local userUuid = redis.call('HGET', KEYS[1], 'userUuid')
local username = redis.call('HGET', KEYS[1], 'username')
local resolvedAt = redis.call('HGET', KEYS[1], 'resolvedAt')
local method = redis.call('HGET', KEYS[1], 'method')
if method == false then
  method = 'minecraft_online_mode'
end
if userUuid == false or username == false or resolvedAt == false then
  return { 0 }
end
redis.call('HSET', KEYS[1], 'status', 'finalizing', 'finishClaimId', ARGV[1])
return { 1, userUuid, username, resolvedAt, method }
`;

// "Not you" discards a verified identity: the whole record is deleted so the
// interaction falls back to a fresh pending allocation with a new code. The
// claim already removed the code key, so only the interaction key goes away.
const RESET_VERIFIED_SCRIPT = `
if redis.call('HGET', KEYS[1], 'status') ~= 'verified' then
  return 0
end
redis.call('DEL', KEYS[1])
return 1
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
  readonly clientName?: string;
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
  readonly method: VerificationMethod;
}

export type VerifiedClaimResult =
  | { readonly status: 'claimed'; readonly claim: VerificationFinalizationClaim }
  | {
      readonly status: 'attempts_exhausted' | 'code_mismatch' | 'unavailable';
    };

export class VerificationStateError extends Error {
  public override readonly name = 'VerificationStateError';
}

export class RedisVerificationStore {
  public constructor(
    private readonly redis: Pick<Redis, 'eval' | 'get' | 'hgetall'>,
    private readonly keyPrefix = 'craftlogin:verification',
  ) {}

  public async allocate(interactionIdInput: string, clientLabel?: string): Promise<string> {
    const interactionId = interactionIdSchema.parse(interactionIdInput);
    const clientName = clientLabel?.trim().slice(0, MAX_CLIENT_NAME_LENGTH) ?? '';
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
          clientName,
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
    const result = claimResultSchema.parse(
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

    const clientName = result[1];
    return {
      claimId,
      code,
      codeKey,
      interactionKey,
      keyId: parsedKeyId.data,
      ...(clientName === '' ? {} : { clientName }),
    };
  }

  public async claimInteraction(
    interactionIdInput: string,
    skinClaim?: { readonly interactionKey: string; readonly claimId: string },
  ): Promise<VerificationClaim | null> {
    const interactionId = interactionIdSchema.parse(interactionIdInput);
    const keyId = this.interactionKeyId(interactionId);
    const interactionKey = this.interactionKey(keyId);
    const claimId = randomUUID();
    const result = interactionClaimResultSchema.parse(
      await this.redis.eval(
        CLAIM_INTERACTION_SCRIPT,
        skinClaim === undefined ? 1 : 2,
        interactionKey,
        ...(skinClaim === undefined ? [] : [skinClaim.interactionKey]),
        keyId,
        claimId,
        `${this.keyPrefix}:code:`,
        PROCESSING_TTL_MS,
        skinClaim?.claimId ?? '',
      ),
    );
    const code = result[0];
    return code === undefined
      ? null
      : {
          claimId,
          code,
          codeKey: this.codeKey(code),
          interactionKey,
          keyId,
        };
  }

  public async complete(
    claim: VerificationClaim,
    playerInput: AuthenticatedMinecraftPlayer,
    resolvedAt: Date,
    method: VerificationMethod = 'minecraft_online_mode',
    confirmationCode?: string,
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
        verificationMethodSchema.parse(method),
        RESOLVED_TTL_MS,
        confirmationCode ?? '',
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
    confirmationCode?: string,
  ): Promise<VerifiedClaimResult> {
    const interactionId = interactionIdSchema.parse(interactionIdInput);
    const interactionKey = this.interactionKey(this.interactionKeyId(interactionId));
    const claimId = randomUUID();
    const result = verifiedClaimResultSchema.parse(
      await this.redis.eval(
        CLAIM_VERIFIED_SCRIPT,
        1,
        interactionKey,
        claimId,
        confirmationCode?.trim().toUpperCase() ?? '',
        MAX_CONFIRMATION_ATTEMPTS,
      ),
    );

    if (result.length === 1) {
      const marker = result[0];
      return {
        status:
          marker === 2 ? 'code_mismatch' : marker === 3 ? 'attempts_exhausted' : 'unavailable',
      };
    }

    const [, uuid, username, resolvedAt, method] = result;
    return {
      status: 'claimed',
      claim: {
        claimId,
        interactionKey,
        player: { uuid, username },
        resolvedAt,
        method,
      },
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

  public async reset(interactionIdInput: string): Promise<boolean> {
    const interactionId = interactionIdSchema.parse(interactionIdInput);
    const interactionKey = this.interactionKey(this.interactionKeyId(interactionId));
    const result = scriptBooleanSchema.parse(
      await this.redis.eval(RESET_VERIFIED_SCRIPT, 1, interactionKey),
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
      ...(parsed.data.confirmCode === undefined ? {} : { requiresConfirmCode: true }),
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
