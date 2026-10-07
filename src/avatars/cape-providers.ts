import { readBoundedResponseBody } from '../mojang/bounded-body.js';
import { isBoundedTexturePng } from './skin-texture.js';
import type { SpecificCapeProvider } from './types.js';

const CRAFTLOGIN_USER_AGENT = 'CraftLogin/0.1 (+https://github.com/danielsebesta/craftlogin)';
const FETCH_TIMEOUT_MS = 3_000;
// OptiFine is cleartext HTTP and the rest are third-party, so reads stay
// bounded against hostile or broken providers.
const MAX_CAPE_BYTES = 256 * 1_024;

export async function fetchOptifineCape(
  username: string,
  fetchFn: typeof fetch = fetch,
): Promise<Buffer | undefined> {
  const sanitized = username.trim();
  if (sanitized.length < 2 || sanitized.length > 16) {
    return undefined;
  }
  try {
    const response = await fetchFn(
      `http://s.optifine.net/capes/${encodeURIComponent(sanitized)}.png`,
      {
        headers: { 'User-Agent': CRAFTLOGIN_USER_AGENT },
        redirect: 'error',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      return undefined;
    }
    const buffer = await readBoundedResponseBody(response, MAX_CAPE_BYTES, 'Cape');
    return isBoundedTexturePng(buffer) ? buffer : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchLabymodCape(
  canonicalUuid: string,
  fetchFn: typeof fetch = fetch,
): Promise<Buffer | undefined> {
  try {
    const response = await fetchFn(
      `https://dl.labymod.net/capes/${encodeURIComponent(canonicalUuid)}`,
      {
        headers: { 'User-Agent': CRAFTLOGIN_USER_AGENT },
        redirect: 'error',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      return undefined;
    }
    const buffer = await readBoundedResponseBody(response, MAX_CAPE_BYTES, 'Cape');
    return isBoundedTexturePng(buffer) ? buffer : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchMinecraftcapesCape(
  undashedUuid: string,
  fetchFn: typeof fetch = fetch,
): Promise<Buffer | undefined> {
  try {
    const response = await fetchFn(
      `https://api.minecraftcapes.net/profile/${encodeURIComponent(undashedUuid)}/cape`,
      {
        headers: { 'User-Agent': CRAFTLOGIN_USER_AGENT },
        redirect: 'error',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      return undefined;
    }
    const buffer = await readBoundedResponseBody(response, MAX_CAPE_BYTES, 'Cape');
    return isBoundedTexturePng(buffer) ? buffer : undefined;
  } catch {
    return undefined;
  }
}

export async function fetch5zigCape(
  canonicalUuid: string,
  fetchFn: typeof fetch = fetch,
): Promise<Buffer | undefined> {
  try {
    const response = await fetchFn(
      `https://textures.5zigreborn.eu/profile/${encodeURIComponent(canonicalUuid)}`,
      {
        headers: { 'User-Agent': CRAFTLOGIN_USER_AGENT },
        redirect: 'error',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      return undefined;
    }
    const body = await readBoundedResponseBody(response, MAX_CAPE_BYTES, 'Cape provider');
    const json: unknown = JSON.parse(body.toString('utf8'));
    if (isRecord(json)) {
      const rawData = json['d'];
      if (typeof rawData === 'string') {
        const buffer = Buffer.from(rawData, 'base64');
        return buffer.length <= MAX_CAPE_BYTES && isBoundedTexturePng(buffer) ? buffer : undefined;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function fetchSkinmcCape(
  canonicalUuid: string,
  fetchFn: typeof fetch = fetch,
): Promise<Buffer | undefined> {
  try {
    const response = await fetchFn(
      `https://skinmc.net/api/v1/skinmcCape/${encodeURIComponent(canonicalUuid)}`,
      {
        headers: { 'User-Agent': CRAFTLOGIN_USER_AGENT },
        redirect: 'error',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      return undefined;
    }
    const buffer = await readBoundedResponseBody(response, MAX_CAPE_BYTES, 'Cape');
    return isBoundedTexturePng(buffer) ? buffer : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface PlayerIdentityForCapes {
  readonly canonicalUuid: string;
  readonly undashedUuid: string;
  readonly username: string;
}

export async function fetchThirdPartyCape(
  provider: Exclude<SpecificCapeProvider, 'mojang'>,
  identity: PlayerIdentityForCapes,
  fetchFn: typeof fetch = fetch,
): Promise<Buffer | undefined> {
  switch (provider) {
    case 'optifine':
      return await fetchOptifineCape(identity.username, fetchFn);
    case 'labymod':
      return await fetchLabymodCape(identity.canonicalUuid, fetchFn);
    case 'minecraftcapes':
      return await fetchMinecraftcapesCape(identity.undashedUuid, fetchFn);
    case '5zig':
      return await fetch5zigCape(identity.canonicalUuid, fetchFn);
    case 'skinmc':
      return await fetchSkinmcCape(identity.canonicalUuid, fetchFn);
  }
}
