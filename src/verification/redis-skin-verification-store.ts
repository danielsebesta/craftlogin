import { createHash, randomUUID } from 'node:crypto';

import type { Redis } from 'ioredis';
import { z } from 'zod';

import { interactionIdSchema, authenticatedMinecraftPlayerSchema } from './types.js';

const CHALLENGE_TTL_MS = 5 * 60 * 1_000;
const CHECK_INTERVAL_MS = 10 * 1_000;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;

const scriptBooleanSchema = z.union([z.literal(0), z.literal(1)]);
const claimResultSchema = z.union([
  z.tuple([]),
  z.tuple([
    authenticatedMinecraftPlayerSchema.shape.uuid,
    authenticatedMinecraftPlayerSchema.shape.username,
    z.string().regex(HASH_PATTERN),
  ]),
]);
const storedChallengeSchema = z.object({
  body: z.string().min(1),
  height: z.enum(['32', '64']),
  markerHash: z.string().regex(HASH_PATTERN),
  model: z.enum(['classic', 'slim']),
  originalBody: z.string().optional(),
  status: z.enum(['pending', 'checking']),
  username: authenticatedMinecraftPlayerSchema.shape.username,
  userUuid: authenticatedMinecraftPlayerSchema.shape.uuid,
});

const CREATE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  return 0
end
redis.call(
  'HSET', KEYS[1],
  'status', 'pending',
  'userUuid', ARGV[1],
  'username', ARGV[2],
  'markerHash', ARGV[3],
  'body', ARGV[4],
  'originalBody', ARGV[5],
  'height', ARGV[6],
  'model', ARGV[7]
)
redis.call('PEXPIRE', KEYS[1], ARGV[8])
return 1
`;

const CLAIM_CHECK_SCRIPT = `
if redis.call('HGET', KEYS[1], 'status') ~= 'pending' then
  return {}
end
local redisTime = redis.call('TIME')
local nowMilliseconds = (redisTime[1] * 1000) + math.floor(redisTime[2] / 1000)
local lastCheckAt = tonumber(redis.call('HGET', KEYS[1], 'lastCheckAt'))
if lastCheckAt ~= nil and nowMilliseconds - lastCheckAt < tonumber(ARGV[2]) then
  return {}
end
local userUuid = redis.call('HGET', KEYS[1], 'userUuid')
local username = redis.call('HGET', KEYS[1], 'username')
local markerHash = redis.call('HGET', KEYS[1], 'markerHash')
if userUuid == false or username == false or markerHash == false then
  return {}
end
redis.call(
  'HSET', KEYS[1],
  'status', 'checking',
  'claimId', ARGV[1],
  'lastCheckAt', nowMilliseconds
)
return { userUuid, username, markerHash }
`;

const RELEASE_CHECK_SCRIPT = `
if redis.call('HGET', KEYS[1], 'status') ~= 'checking' then
  return 0
end
if redis.call('HGET', KEYS[1], 'claimId') ~= ARGV[1] then
  return 0
end
redis.call('HSET', KEYS[1], 'status', 'pending')
redis.call('HDEL', KEYS[1], 'claimId')
return 1
`;

const DELETE_CLAIMED_SCRIPT = `
if redis.call('HGET', KEYS[1], 'status') ~= 'checking' then
  return 0
end
if redis.call('HGET', KEYS[1], 'claimId') ~= ARGV[1] then
  return 0
end
redis.call('DEL', KEYS[1])
return 1
`;

export interface SkinVerificationChallengeInput {
  readonly body: Buffer;
  readonly height: 32 | 64;
  readonly markerHash: string;
  readonly model: 'classic' | 'slim';
  /** The unmodified source skin, retained only for this five-minute challenge. */
  readonly originalBody?: Buffer;
  readonly userUuid: string;
  readonly username: string;
}

export interface SkinVerificationChallenge extends SkinVerificationChallengeInput {
  readonly status: 'checking' | 'pending';
}

export interface SkinVerificationCheckClaim {
  readonly claimId: string;
  readonly interactionKey: string;
  readonly markerHash: string;
  readonly userUuid: string;
  readonly username: string;
}

export class SkinVerificationStateError extends Error {
  public override readonly name = 'SkinVerificationStateError';
}

export class RedisSkinVerificationStore {
  public constructor(
    private readonly redis: Pick<Redis, 'eval' | 'hgetall'>,
    private readonly keyPrefix = 'craftlogin:skin-verification',
  ) {}

  public async create(
    interactionIdInput: string,
    challengeInput: SkinVerificationChallengeInput,
  ): Promise<SkinVerificationChallenge> {
    const interactionId = interactionIdSchema.parse(interactionIdInput);
    const challenge = parseChallengeInput(challengeInput);
    const interactionKey = this.interactionKey(interactionId);
    await this.redis.eval(
      CREATE_SCRIPT,
      1,
      interactionKey,
      challenge.userUuid,
      challenge.username,
      challenge.markerHash,
      challenge.body.toString('base64'),
      challenge.originalBody?.toString('base64') ?? '',
      challenge.height,
      challenge.model,
      CHALLENGE_TTL_MS,
    );
    const stored = await this.get(interactionId);
    if (stored === undefined) {
      throw new SkinVerificationStateError('The skin verification challenge could not be stored');
    }
    return stored;
  }

  public async get(interactionIdInput: string): Promise<SkinVerificationChallenge | undefined> {
    const interactionId = interactionIdSchema.parse(interactionIdInput);
    const stored = await this.redis.hgetall(this.interactionKey(interactionId));
    if (Object.keys(stored).length === 0) {
      return undefined;
    }
    const parsed = storedChallengeSchema.safeParse(stored);
    if (!parsed.success) {
      throw new SkinVerificationStateError('The skin verification challenge is invalid');
    }
    return {
      body: Buffer.from(parsed.data.body, 'base64'),
      height: Number(parsed.data.height) === 32 ? 32 : 64,
      markerHash: parsed.data.markerHash,
      model: parsed.data.model,
      ...(parsed.data.originalBody === undefined || parsed.data.originalBody.length === 0
        ? {}
        : { originalBody: Buffer.from(parsed.data.originalBody, 'base64') }),
      status: parsed.data.status,
      username: parsed.data.username,
      userUuid: parsed.data.userUuid,
    };
  }

  public async claimCheck(interactionIdInput: string): Promise<SkinVerificationCheckClaim | null> {
    const interactionId = interactionIdSchema.parse(interactionIdInput);
    const interactionKey = this.interactionKey(interactionId);
    const claimId = randomUUID();
    const result = claimResultSchema.parse(
      await this.redis.eval(CLAIM_CHECK_SCRIPT, 1, interactionKey, claimId, CHECK_INTERVAL_MS),
    );
    const [userUuid, username, markerHash] = result;
    return userUuid === undefined || username === undefined || markerHash === undefined
      ? null
      : { claimId, interactionKey, markerHash, username, userUuid };
  }

  public async releaseCheck(claim: SkinVerificationCheckClaim): Promise<boolean> {
    const result = scriptBooleanSchema.parse(
      await this.redis.eval(RELEASE_CHECK_SCRIPT, 1, claim.interactionKey, claim.claimId),
    );
    return result === 1;
  }

  public async deleteClaimed(claim: SkinVerificationCheckClaim): Promise<boolean> {
    const result = scriptBooleanSchema.parse(
      await this.redis.eval(DELETE_CLAIMED_SCRIPT, 1, claim.interactionKey, claim.claimId),
    );
    return result === 1;
  }

  private interactionKey(interactionId: string): string {
    const keyId = createHash('sha256').update(interactionId, 'utf8').digest('hex');
    return `${this.keyPrefix}:interaction:${keyId}`;
  }
}

function parseChallengeInput(
  input: SkinVerificationChallengeInput,
): SkinVerificationChallengeInput {
  const parsed = storedChallengeSchema
    .omit({ originalBody: true, status: true, body: true, height: true })
    .parse(input);
  if (input.body.length === 0) {
    throw new SkinVerificationStateError('The skin verification image is invalid');
  }
  if (input.originalBody?.length === 0) {
    throw new SkinVerificationStateError('The original Minecraft skin image is invalid');
  }
  return {
    ...parsed,
    body: input.body,
    height: input.height,
    ...(input.originalBody === undefined ? {} : { originalBody: input.originalBody }),
  };
}
