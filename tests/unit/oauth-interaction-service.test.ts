import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { describe, expect, it } from 'vitest';

import type {
  OAuthInteractionContext,
  OAuthInteractionGateway,
} from '../../src/oauth/interaction-gateway.js';
import { OAuthInteractionService } from '../../src/oauth/interaction-service.js';
import type { OAuthInteractionLogger } from '../../src/oauth/interaction-service.js';
import type {
  VerificationFinalizationClaim,
  VerificationMethod,
} from '../../src/verification/redis-verification-store.js';
import type { AuthenticatedMinecraftPlayer } from '../../src/verification/types.js';

const player: AuthenticatedMinecraftPlayer = {
  uuid: '123e4567-e89b-42d3-a456-426614174000',
  username: 'VerifiedPlayer',
};
const resolvedAt = '2026-09-06T12:00:00.000Z';

class RecordingGateway implements OAuthInteractionGateway {
  public fail = false;
  public persisted = 0;
  public context: OAuthInteractionContext = {
    clientId: 'test-client',
    interactionId: 'interaction-id',
    promptName: 'login',
    promptDetails: {},
    scope: 'openid profile',
  };

  public inspect(): Promise<OAuthInteractionContext> {
    return Promise.resolve(this.context);
  }

  public abort(): Promise<string> {
    return Promise.resolve('/oauth2/authorize?error=access_denied');
  }

  public persistVerifiedResult(
    _request: IncomingMessage,
    _response: ServerResponse,
    expectedInteractionId: string,
    authenticatedPlayer: AuthenticatedMinecraftPlayer,
    verificationTime: string,
    method: VerificationMethod,
  ): Promise<string> {
    expect(expectedInteractionId).toBe(this.context.interactionId);
    expect(authenticatedPlayer).toEqual(player);
    expect(verificationTime).toBe(resolvedAt);
    expect(method).toBe('minecraft_online_mode');
    this.persisted += 1;
    return this.fail
      ? Promise.reject(new Error('OIDC persistence failed'))
      : Promise.resolve('/oauth2/resume');
  }
}

class SkinVerificationStub {
  public starts: { interactionId: string; username: string }[] = [];

  public check(): Promise<{ status: 'pending'; code: string }> {
    return Promise.resolve({ code: 'ABCDEFGH', status: 'pending' });
  }

  public getChallenge(): Promise<{
    body: Buffer;
    height: 64;
    markerHash: string;
    model: 'slim';
    status: 'pending';
    username: string;
    userUuid: string;
  }> {
    return Promise.resolve({
      body: Buffer.from('skin'),
      height: 64,
      markerHash: 'a'.repeat(64),
      model: 'slim',
      status: 'pending',
      username: 'VerifiedPlayer',
      userUuid: player.uuid,
    });
  }

  public async start(
    interactionId: string,
    username: string,
  ): ReturnType<SkinVerificationStub['getChallenge']> {
    this.starts.push({ interactionId, username });
    return await this.getChallenge();
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
      method: 'minecraft_online_mode',
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
      allowsOnlineVerification: true,
      allowsSkinVerification: false,
      clientId: 'test-client',
      code: 'ABCDEFGH',
      interactionId: 'interaction-id',
      kind: 'login',
      scope: 'openid profile',
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

  it('offers skin verification unless acr_values requires online mode only', async (): Promise<void> => {
    const gateway = new RecordingGateway();
    const skin = new SkinVerificationStub();
    const store = new FinalizationStore();
    const service = new OAuthInteractionService(gateway, store, new RecordingLogger(), skin);
    const first = createTransport();

    await expect(service.start(first.request, first.response)).resolves.toMatchObject({
      allowsOnlineVerification: true,
      allowsSkinVerification: true,
      skinChallenge: { height: 64, model: 'slim', username: 'VerifiedPlayer' },
    });
    const second = createTransport();
    await expect(
      service.startSkin(second.request, second.response, 'VerifiedPlayer'),
    ).resolves.toMatchObject({ username: 'VerifiedPlayer' });
    expect(skin.starts).toEqual([{ interactionId: 'interaction-id', username: 'VerifiedPlayer' }]);

    gateway.context = {
      ...gateway.context,
      acrValues: 'urn:craftlogin:minecraft-online-mode',
    };
    const restricted = createTransport();
    await expect(service.start(restricted.request, restricted.response)).resolves.toMatchObject({
      allowsOnlineVerification: true,
      allowsSkinVerification: false,
    });
    const denied = createTransport();
    await expect(
      service.startSkin(denied.request, denied.response, 'VerifiedPlayer'),
    ).rejects.toThrow('requires a different authentication method');
  });

  it('denies the pending request without persisting an OIDC login', async (): Promise<void> => {
    const gateway = new RecordingGateway();
    const service = new OAuthInteractionService(
      gateway,
      new FinalizationStore(),
      new RecordingLogger(),
    );
    const { request, response } = createTransport();

    await expect(service.abort(request, response)).resolves.toEqual({
      redirectTo: '/oauth2/authorize?error=access_denied',
    });
    expect(gateway.persisted).toBe(0);
  });

  it('rejects an abort URL that is not bound to the active signed session', async (): Promise<void> => {
    const service = new OAuthInteractionService(
      new RecordingGateway(),
      new FinalizationStore(),
      new RecordingLogger(),
    );
    const { request, response } = createTransport();

    await expect(service.abort(request, response, 'different-interaction')).rejects.toThrow(
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
