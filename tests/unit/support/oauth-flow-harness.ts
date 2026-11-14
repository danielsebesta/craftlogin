import { createHash, generateKeyPairSync } from 'node:crypto';

import {
  errors,
  type Adapter,
  type AdapterFactory,
  type AdapterPayload,
  type JWK,
} from 'oidc-provider';

import type { VerifiedClaimResult } from '../../../src/verification/redis-verification-store.js';
import type { VerificationMethod } from '../../../src/verification/types.js';

export const accountId = '123e4567-e89b-42d3-a456-426614174000';
export const redirectUri = 'https://client.example/callback';
export const verifier = 'correct-horse-battery-staple-with-enough-pkce-entropy-123456789';
export const challenge = createHash('sha256').update(verifier, 'utf8').digest('base64url');

export interface StoredAdapterState {
  readonly records: Map<string, AdapterPayload>;
  readonly uidIndexes: Map<string, string>;
}

export class TestMemoryAdapter implements Adapter {
  public constructor(
    private readonly model: string,
    private readonly state: StoredAdapterState,
  ) {}

  public upsert(id: string, payload: AdapterPayload): Promise<void> {
    this.state.records.set(this.key(id), { ...payload });
    if (this.model === 'Session' && typeof payload.uid === 'string') {
      this.state.uidIndexes.set(payload.uid, id);
    }
    return Promise.resolve();
  }

  public find(id: string): Promise<AdapterPayload | undefined> {
    return Promise.resolve(this.state.records.get(this.key(id)));
  }

  public findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const id = this.state.uidIndexes.get(uid);
    return id === undefined ? Promise.resolve(undefined) : this.find(id);
  }

  public findByUserCode(): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  public consume(id: string): Promise<void> {
    const key = this.key(id);
    const payload = this.state.records.get(key);
    if (payload === undefined || payload.consumed !== undefined) {
      return Promise.reject(new errors.InvalidGrant('OIDC artifact was already consumed'));
    }
    this.state.records.set(key, { ...payload, consumed: Math.floor(Date.now() / 1_000) });
    return Promise.resolve();
  }

  public destroy(id: string): Promise<void> {
    this.state.records.delete(this.key(id));
    return Promise.resolve();
  }

  public revokeByGrantId(grantId: string): Promise<void> {
    for (const [key, payload] of this.state.records) {
      if (payload.grantId === grantId) {
        this.state.records.delete(key);
      }
    }
    return Promise.resolve();
  }

  private key(id: string): string {
    return `${this.model}:${id}`;
  }
}

export class VerifiedInteractionStore {
  public interactionId: string | undefined;
  public method: VerificationMethod = 'microsoft_oauth';
  public verified = false;
  public confirmCode: string | undefined;
  private claimed = false;

  public allocate(interactionId: string): Promise<string> {
    this.interactionId = interactionId;
    this.claimed = false;
    this.verified = false;
    return Promise.resolve('ABCDEFGH');
  }

  public claimVerified(
    interactionId: string,
    confirmationCode?: string,
  ): Promise<VerifiedClaimResult> {
    if (!this.verified || this.claimed || interactionId !== this.interactionId) {
      return Promise.resolve({ status: 'unavailable' });
    }
    if (this.confirmCode !== undefined && this.confirmCode !== confirmationCode) {
      return Promise.resolve({ status: 'code_mismatch' });
    }
    this.claimed = true;
    return Promise.resolve({
      status: 'claimed',
      claim: {
        claimId: 'finalization-claim',
        interactionKey: 'interaction-key',
        method: this.method,
        player: { uuid: accountId, username: 'VerifiedPlayer' },
        resolvedAt: '2026-09-06T12:00:00.000Z',
      },
    });
  }

  public completeFinalization(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public getStatus(interactionId: string): Promise<
    | { status: 'pending'; code: string }
    | {
        status: 'verified';
        player: { uuid: string; username: string };
        resolvedAt: string;
      }
  > {
    // Verification state is bound to one interaction, matching the real store.
    return Promise.resolve(
      this.verified && interactionId === this.interactionId
        ? {
            status: 'verified',
            player: { uuid: accountId, username: 'VerifiedPlayer' },
            resolvedAt: '2026-09-06T12:00:00.000Z',
          }
        : { status: 'pending', code: 'ABCDEFGH' },
    );
  }

  public releaseFinalization(): Promise<boolean> {
    this.claimed = false;
    return Promise.resolve(true);
  }

  public reset(interactionId: string): Promise<boolean> {
    if (!this.verified || interactionId !== this.interactionId) {
      return Promise.resolve(false);
    }
    this.verified = false;
    return Promise.resolve(true);
  }
}

export function createTestAdapter(clients: Record<string, AdapterPayload>): AdapterFactory {
  const state: StoredAdapterState = {
    records: new Map(
      Object.entries(clients).map(([clientId, payload]) => [`Client:${clientId}`, payload]),
    ),
    uidIndexes: new Map(),
  };
  return (model: string): Adapter => new TestMemoryAdapter(model, state);
}

export function createSigningKey(): JWK {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2_048 });
  return {
    ...privateKey.export({ format: 'jwk' }),
    alg: 'RS256',
    kid: 'test-signing-key',
    use: 'sig',
  };
}

export function proxyHeaders(cookie?: string): Record<string, string> {
  const headers = {
    'user-agent': 'CraftLogin flow test',
    'x-forwarded-for': '198.51.100.42',
    'x-forwarded-proto': 'https',
  };
  return cookie === undefined ? headers : { ...headers, cookie };
}

export function localTestUrl(location: string, issuer: string): URL {
  const url = new URL(location, issuer);
  url.protocol = 'http:';
  return url;
}

export function interactionChildUrl(location: string, child: string, issuer: string): URL {
  const url = localTestUrl(location, issuer);
  url.pathname = `${url.pathname.replace(/\/$/u, '')}/${child}`;
  url.search = '';
  return url;
}

export function forwardTargetUrl(body: string): string {
  const target = /http-equiv="refresh" content="0;url=([^"]+)"/u.exec(body)?.[1];
  if (target === undefined) {
    throw new Error('Expected an auto-forward page with a refresh target');
  }
  return target.replace(/&amp;/gu, '&');
}

export function requiredLocation(response: Response): string {
  const location = response.headers.get('location');
  if (location === null) {
    throw new Error('Expected an HTTP redirect location');
  }
  return location;
}
