import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { describe, expect, it } from 'vitest';

import type {
  OAuthInteractionContext,
  OAuthInteractionGateway,
} from '../../src/oauth/interaction-gateway.js';
import { OAuthInteractionService } from '../../src/oauth/interaction-service.js';
import type { OAuthInteractionLogger } from '../../src/oauth/interaction-service.js';
import type { VerificationFinalizationClaim } from '../../src/verification/redis-verification-store.js';
import type { AuthenticatedMinecraftPlayer } from '../../src/verification/types.js';

const player: AuthenticatedMinecraftPlayer = {
  uuid: '123e4567-e89b-42d3-a456-426614174000',
  username: 'VerifiedPlayer',
};
const resolvedAt = '2026-09-06T12:00:00.000Z';

class RecordingGateway implements OAuthInteractionGateway {
  public fail = false;
  public persisted = 0;
  public readonly context: OAuthInteractionContext = {
    clientId: 'test-client',
    interactionId: 'interaction-id',
    promptName: 'login',
    scope: 'openid profile',
  };

  public inspect(): Promise<OAuthInteractionContext> {
    return Promise.resolve(this.context);
  }

  public persistVerifiedResult(
    _request: IncomingMessage,
    _response: ServerResponse,
    expectedInteractionId: string,
    authenticatedPlayer: AuthenticatedMinecraftPlayer,
    verificationTime: string,
  ): Promise<string> {
    expect(expectedInteractionId).toBe(this.context.interactionId);
    expect(authenticatedPlayer).toEqual(player);
    expect(verificationTime).toBe(resolvedAt);
    this.persisted += 1;
    return this.fail
      ? Promise.reject(new Error('OIDC persistence failed'))
      : Promise.resolve('/oauth2/resume');
  }
}

class FinalizationStore {
  public allocations: string[] = [];
  public completed = 0;
  public released = 0;
  public verified = false;
  public completeError: Error | undefined;
  public completeResult = true;
  private claimed = false;

  public allocate(interactionId: string): Promise<string> {
    this.allocations.push(interactionId);
    return Promise.resolve('ABCDEFGH');
  }

  public claimVerified(): Promise<VerificationFinalizationClaim | null> {
    if (!this.verified || this.claimed) {
      return Promise.resolve(null);
    }
    this.claimed = true;
    return Promise.resolve({
      claimId: 'claim-id',
      interactionKey: 'interaction-key',
      player,
      resolvedAt,
    });
  }

  public completeFinalization(): Promise<boolean> {
    this.completed += 1;
    return this.completeError === undefined
      ? Promise.resolve(this.completeResult)
      : Promise.reject(this.completeError);
  }

  public getStatus(): Promise<
    | { status: 'pending'; code: string }
    | { status: 'verified'; player: AuthenticatedMinecraftPlayer; resolvedAt: string }
  > {
    return Promise.resolve(
      this.verified
        ? { status: 'verified', player, resolvedAt }
        : { status: 'pending', code: 'ABCDEFGH' },
    );
  }

  public releaseFinalization(): Promise<boolean> {
    this.released += 1;
    this.claimed = false;
    return Promise.resolve(true);
  }
}

class RecordingLogger implements OAuthInteractionLogger {
  public readonly errorKinds: string[] = [];

  public error(bindings: { readonly errorKind: string }): void {
    this.errorKinds.push(bindings.errorKind);
  }
}

describe('OAuthInteractionService', (): void => {
  it('uses the exact oidc-provider interaction id for verification allocation', async (): Promise<void> => {
    const gateway = new RecordingGateway();
    const store = new FinalizationStore();
    const service = new OAuthInteractionService(gateway, store, new RecordingLogger());
    const { request, response } = createTransport();

    await expect(service.start(request, response)).resolves.toEqual({
      clientId: 'test-client',
      code: 'ABCDEFGH',
      interactionId: 'interaction-id',
    });
    expect(store.allocations).toEqual(['interaction-id']);
  });

  it('rejects an interaction URL that is not bound to the active signed session', async (): Promise<void> => {
    const service = new OAuthInteractionService(
      new RecordingGateway(),
      new FinalizationStore(),
      new RecordingLogger(),
    );
    const { request, response } = createTransport();

    await expect(service.start(request, response, 'different-interaction')).rejects.toThrow(
      'does not match the active session',
    );
  });

  it('does not persist an OIDC login before Minecraft verification', async (): Promise<void> => {
    const gateway = new RecordingGateway();
    const service = new OAuthInteractionService(
      gateway,
      new FinalizationStore(),
      new RecordingLogger(),
    );
    const { request, response } = createTransport();

    await expect(service.complete(request, response)).resolves.toEqual({ status: 'pending' });
    expect(gateway.persisted).toBe(0);
  });

  it('allows one concurrent completion for a verified interaction', async (): Promise<void> => {
    const gateway = new RecordingGateway();
    const store = new FinalizationStore();
    store.verified = true;
    const service = new OAuthInteractionService(gateway, store, new RecordingLogger());
    const first = createTransport();
    const second = createTransport();

    const results = await Promise.all([
      service.complete(first.request, first.response),
      service.complete(second.request, second.response),
    ]);

    expect(results).toContainEqual({ status: 'complete', redirectTo: '/oauth2/resume' });
    expect(results).toContainEqual({ status: 'pending' });
    expect(gateway.persisted).toBe(1);
    expect(store.completed).toBe(1);
    expect(store.released).toBe(0);
  });

  it('releases the finalization claim when OIDC persistence fails', async (): Promise<void> => {
    const gateway = new RecordingGateway();
    gateway.fail = true;
    const store = new FinalizationStore();
    store.verified = true;
    const service = new OAuthInteractionService(gateway, store, new RecordingLogger());
    const { request, response } = createTransport();

    await expect(service.complete(request, response)).rejects.toThrow('OIDC persistence failed');
    expect(store.completed).toBe(0);
    expect(store.released).toBe(1);
  });

  it('does not reopen a completed provider result when Redis cleanup fails', async (): Promise<void> => {
    const gateway = new RecordingGateway();
    const store = new FinalizationStore();
    const logger = new RecordingLogger();
    store.verified = true;
    store.completeError = new Error('Redis unavailable');
    const service = new OAuthInteractionService(gateway, store, logger);
    const { request, response } = createTransport();

    await expect(service.complete(request, response)).resolves.toEqual({
      status: 'complete',
      redirectTo: '/oauth2/resume',
    });
    expect(store.completed).toBe(1);
    expect(store.released).toBe(0);
    expect(logger.errorKinds).toEqual(['Error']);
  });

  it('does not reopen a completed provider result when its cleanup claim was lost', async (): Promise<void> => {
    const gateway = new RecordingGateway();
    const store = new FinalizationStore();
    const logger = new RecordingLogger();
    store.verified = true;
    store.completeResult = false;
    const service = new OAuthInteractionService(gateway, store, logger);
    const { request, response } = createTransport();

    await expect(service.complete(request, response)).resolves.toEqual({
      status: 'complete',
      redirectTo: '/oauth2/resume',
    });
    expect(store.released).toBe(0);
    expect(logger.errorKinds).toEqual(['VerificationFinalizationClaimLost']);
  });
});

function createTransport(): { request: IncomingMessage; response: ServerResponse } {
  const request = new IncomingMessage(new Socket());
  return { request, response: new ServerResponse(request) };
}
