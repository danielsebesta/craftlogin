import { createHash } from 'node:crypto';

import type { Redis } from 'ioredis';
import { errors, type Adapter, type AdapterPayload } from 'oidc-provider';
import { z } from 'zod';

import { english } from '../locales/en.js';

const CLOCK_TOLERANCE_SECONDS = 15;
const MODEL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,63}$/u;
const GRANTABLE_MODELS = new Set([
  'AccessToken',
  'AuthorizationCode',
  'BackchannelAuthenticationRequest',
  'DeviceCode',
  'PreAuthorizedCode',
]);

const scriptBooleanSchema = z.union([z.literal(0), z.literal(1)]);
const storedEnvelopeSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
  uidKey: z.string().nullable(),
  userCodeKey: z.string().nullable(),
  grantKey: z.string().nullable(),
  indexValue: z.string().nullable(),
});

const UPSERT_SCRIPT = `
local previousRaw = redis.call('GET', KEYS[1])
if previousRaw ~= false then
  local decodeOk, previous = pcall(cjson.decode, previousRaw)
  if decodeOk then
    if previous.uidKey ~= cjson.null and redis.call('GET', previous.uidKey) == previous.indexValue then
      redis.call('DEL', previous.uidKey)
    end
    if previous.userCodeKey ~= cjson.null and redis.call('GET', previous.userCodeKey) == previous.indexValue then
      redis.call('DEL', previous.userCodeKey)
    end
    if previous.grantKey ~= cjson.null then
      redis.call('SREM', previous.grantKey, KEYS[1])
    end
  end
end

redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
if ARGV[3] ~= '' then
  redis.call('SET', ARGV[3], ARGV[6], 'PX', ARGV[2])
end
if ARGV[4] ~= '' then
  redis.call('SET', ARGV[4], ARGV[6], 'PX', ARGV[2])
end
if ARGV[5] ~= '' then
  redis.call('SADD', ARGV[5], KEYS[1])
  local grantTtl = redis.call('PTTL', ARGV[5])
  if grantTtl < tonumber(ARGV[2]) then
    redis.call('PEXPIRE', ARGV[5], ARGV[2])
  end
end
return 1
`;

const CONSUME_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if raw == false then
  return 0
end
local value = cjson.decode(raw)
local function deleteArtifact()
  redis.call('DEL', KEYS[1])
  if value.uidKey ~= cjson.null and redis.call('GET', value.uidKey) == value.indexValue then
    redis.call('DEL', value.uidKey)
  end
  if value.userCodeKey ~= cjson.null and redis.call('GET', value.userCodeKey) == value.indexValue then
    redis.call('DEL', value.userCodeKey)
  end
  if value.grantKey ~= cjson.null then
    redis.call('SREM', value.grantKey, KEYS[1])
  end
end
if value.payload.consumed ~= nil then
  deleteArtifact()
  return 0
end
local remainingTtl = redis.call('PTTL', KEYS[1])
if remainingTtl <= 0 then
  deleteArtifact()
  return 0
end
deleteArtifact()
return 1
`;

const DESTROY_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if raw == false then
  return 0
end
local decodeOk, value = pcall(cjson.decode, raw)
redis.call('DEL', KEYS[1])
if decodeOk then
  if value.uidKey ~= cjson.null and redis.call('GET', value.uidKey) == value.indexValue then
    redis.call('DEL', value.uidKey)
  end
  if value.userCodeKey ~= cjson.null and redis.call('GET', value.userCodeKey) == value.indexValue then
    redis.call('DEL', value.userCodeKey)
  end
  if value.grantKey ~= cjson.null then
    redis.call('SREM', value.grantKey, KEYS[1])
  end
end
return 1
`;

const REVOKE_GRANT_SCRIPT = `
local members = redis.call('SMEMBERS', KEYS[1])
for _, artifactKey in ipairs(members) do
  local raw = redis.call('GET', artifactKey)
  if raw ~= false then
    local decodeOk, value = pcall(cjson.decode, raw)
    if decodeOk then
      if value.uidKey ~= cjson.null and redis.call('GET', value.uidKey) == value.indexValue then
        redis.call('DEL', value.uidKey)
      end
      if value.userCodeKey ~= cjson.null and redis.call('GET', value.userCodeKey) == value.indexValue then
        redis.call('DEL', value.userCodeKey)
      end
    end
    redis.call('DEL', artifactKey)
  end
end
redis.call('DEL', KEYS[1])
return 1
`;

type StoredJson = null | boolean | number | string | StoredJson[] | StoredJsonObject;
interface StoredJsonObject {
  [key: string]: StoredJson;
}

interface RedisOidcCommands {
  eval(script: string, numberOfKeys: number, ...args: (number | string)[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
}

export class RedisOidcAdapter implements Adapter {
  private readonly model: string;

  public constructor(
    modelInput: string,
    private readonly redis: Pick<Redis, 'eval' | 'get'> | RedisOidcCommands,
    private readonly keyPrefix = 'craftlogin:oidc',
  ) {
    if (!MODEL_NAME_PATTERN.test(modelInput)) {
      throw new TypeError('Invalid OIDC adapter model name');
    }
    this.model = modelInput;
  }

  public async upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void> {
    const ttlMilliseconds = toTtlMilliseconds(expiresIn);
    const uidKey =
      this.model === 'Session' && typeof payload.uid === 'string'
        ? this.indexKey('uid', payload.uid)
        : null;
    const userCodeKey =
      typeof payload.userCode === 'string' ? this.indexKey('user-code', payload.userCode) : null;
    const grantKey =
      GRANTABLE_MODELS.has(this.model) && typeof payload.grantId === 'string'
        ? this.indexKey('grant', payload.grantId)
        : null;
    const envelope = {
      payload: storedPayload(payload),
      uidKey,
      userCodeKey,
      grantKey,
      indexValue: uidKey === null && userCodeKey === null ? null : id,
    };

    await this.redis.eval(
      UPSERT_SCRIPT,
      1,
      this.artifactKey(id),
      JSON.stringify(envelope),
      ttlMilliseconds,
      uidKey ?? '',
      userCodeKey ?? '',
      grantKey ?? '',
      id,
    );
  }

  public async find(id: string): Promise<AdapterPayload | undefined> {
    const raw = await this.redis.get(this.artifactKey(id));
    if (raw === null) {
      return undefined;
    }

    return { ...parseEnvelope(raw).payload, jti: id };
  }

  public async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    return await this.findByIndex('uid', uid);
  }

  public async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    return await this.findByIndex('user-code', userCode);
  }

  public async consume(id: string): Promise<void> {
    const result = scriptBooleanSchema.parse(
      await this.redis.eval(CONSUME_SCRIPT, 1, this.artifactKey(id)),
    );
    if (result === 0) {
      throw new errors.InvalidGrant(english.api.oauthArtifactUnavailable);
    }
  }

  public async destroy(id: string): Promise<void> {
    await this.redis.eval(DESTROY_SCRIPT, 1, this.artifactKey(id));
  }

  public async revokeByGrantId(grantId: string): Promise<void> {
    await this.redis.eval(REVOKE_GRANT_SCRIPT, 1, this.indexKey('grant', grantId));
  }

  private async findByIndex(kind: string, value: string): Promise<AdapterPayload | undefined> {
    const id = await this.redis.get(this.indexKey(kind, value));
    if (id === null) {
      return undefined;
    }
    return await this.find(id);
  }

  private artifactKey(id: string): string {
    return `${this.keyPrefix}:artifact:${this.model}:${digest(id)}`;
  }

  private indexKey(kind: string, value: string): string {
    return `${this.keyPrefix}:index:${kind}:${digest(value)}`;
  }
}

function parseEnvelope(raw: string): z.infer<typeof storedEnvelopeSchema> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error: unknown) {
    throw new Error('Stored OIDC adapter state is not valid JSON', { cause: error });
  }
  return storedEnvelopeSchema.parse(parsedJson);
}

function storedPayload(payload: AdapterPayload): StoredJsonObject {
  const result: StoredJsonObject = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'jti' || value === undefined) {
      continue;
    }
    result[key] = storedJsonValue(value);
  }
  return result;
}

function storedJsonValue(value: unknown): StoredJson {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('OIDC adapter payload contains a non-finite number');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(storedJsonValue);
  }
  if (typeof value === 'object') {
    const result: StoredJsonObject = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (nestedValue !== undefined) {
        result[key] = storedJsonValue(nestedValue);
      }
    }
    return result;
  }
  throw new TypeError('OIDC adapter payload contains a non-JSON value');
}

function toTtlMilliseconds(expiresIn: number | undefined): number {
  if (expiresIn === undefined || !Number.isSafeInteger(expiresIn) || expiresIn <= 0) {
    throw new TypeError('Ephemeral OIDC adapter records require a positive integer TTL');
  }
  return (expiresIn + CLOCK_TOLERANCE_SECONDS) * 1_000;
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
