import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { describe, expect, it } from 'vitest';

import {
  OAuthInteractionStateError,
  type OAuthInteractionContext,
  type OAuthInteractionGateway,
} from '../../src/oauth/interaction-gateway.js';
import { OAuthInteractionService } from '../../src/oauth/interaction-service.js';
import type { OAuthInteractionLogger } from '../../src/oauth/interaction-service.js';
import type { VerifiedClaimResult } from '../../src/verification/redis-verification-store.js';
import type {
  AuthenticatedMinecraftPlayer,
  VerificationMethod,
} from '../../src/verification/types.js';

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

  public findInteraction(interactionId: string): Promise<OAuthInteractionContext> {
    if (interactionId !== this.context.interactionId) {
      return Promise.reject(
        new OAuthInteractionStateError('The OIDC interaction is no longer available'),
      );
    }
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

  public discards: string[] = [];

  public async start(
    interactionId: string,
    username: string,
  ): ReturnType<SkinVerificationStub['getChallenge']> {
    this.starts.push({ interactionId, username });
    return await this.getChallenge();
  }

  public discard(interactionId: string): Promise<void> {
    this.discards.push(interactionId);
    return Promise.resolve();
  }
}

class FinalizationStore {
  public allocations: string[] = [];
  public allocatedClientNames: (string | undefined)[] = [];
  public completed = 0;
  public released = 0;
  public resets: string[] = [];
  public resetResult = true;
  public processing = false;
  public verified = false;
  public confirmCode: string | undefined;
  public confirmAttempts = 0;
  public completeError: Error | undefined;
  public completeResult = true;
  private claimed = false;

  public allocate(interactionId: string, clientName?: string): Promise<string> {
    this.allocations.push(interactionId);
    this.allocatedClientNames.push(clientName);
    return Promise.resolve('ABCDEFGH');
  }

  public claimVerified(
    _interactionId: string,
    confirmationCode?: string,
  ): Promise<VerifiedClaimResult> {
    if (!this.verified || this.claimed) {
      return Promise.resolve({ status: 'unavailable' });
    }
    if (this.confirmCode !== undefined && this.confirmCode !== confirmationCode) {
      this.confirmAttempts += 1;
      if (this.confirmAttempts >= 10) {
        this.verified = false;
        return Promise.resolve({ status: 'attempts_exhausted' });
      }
      return Promise.resolve({ status: 'code_mismatch' });
    }
    this.claimed = true;
    return Promise.resolve({
      status: 'claimed',
      claim: {
        claimId: 'claim-id',
        interactionKey: 'interaction-key',
        method: 'minecraft_online_mode',
        player,
        resolvedAt,
      },
    });
  }

  public completeFinalization(): Promise<boolean> {
    this.completed += 1;
    return this.completeError === undefined
      ? Promise.resolve(this.completeResult)
      : Promise.reject(this.completeError);
  }

  public getStatus(): Promise<
    | { status: 'expired' }
    | { status: 'pending'; code: string | null }
    | {
        status: 'verified';
        player: AuthenticatedMinecraftPlayer;
        resolvedAt: string;
        requiresConfirmCode?: boolean;
      }
  > {
    if (this.verified) {
      return Promise.resolve({
        status: 'verified',
        player,
        resolvedAt,
        ...(this.confirmCode === undefined ? {} : { requiresConfirmCode: true }),
      });
    }
    if (this.processing) {
      return Promise.resolve({ status: 'pending', code: null });
    }
    return Promise.resolve({ status: 'pending', code: 'ABCDEFGH' });
  }

  public releaseFinalization(): Promise<boolean> {
    this.released += 1;
    this.claimed = false;
    return Promise.resolve(true);
  }

  public reset(interactionId: string): Promise<boolean> {
    this.resets.push(interactionId);
    if (this.resetResult) {
      this.verified = false;
      this.processing = false;
    }
    return Promise.resolve(this.resetResult);
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

  it('shows the verified identity for confirmation instead of allocating a code', async (): Promise<void> => {
    const gateway = new RecordingGateway();
    const store = new FinalizationStore();
    store.verified = true;
    const service = new OAuthInteractionService(gateway, store, new RecordingLogger());
    const { request, response } = createTransport();

    await expect(service.start(request, response)).resolves.toEqual({
      clientId: 'test-client',
      interactionId: 'interaction-id',
      kind: 'login',
      scope: 'openid profile',
      verifiedPlayer: player,
    });
    expect(store.allocations).toEqual([]);
  });

  it('does not allocate a code while a verification claim is in flight', async (): Promise<void> => {
    const gateway = new RecordingGateway();
    const store = new FinalizationStore();
    store.processing = true;
    const service = new OAuthInteractionService(gateway, store, new RecordingLogger());
    const { request, response } = createTransport();

    const interaction = await service.start(request, response);
    expect(interaction.kind).toBe('login');
    expect(interaction).not.toHaveProperty('code');
    expect(store.allocations).toEqual([]);
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

  it('discards the verified identity and re-allocates on explicit rejection', async (): Promise<void> => {
    const gateway = new RecordingGateway();
    const store = new FinalizationStore();
    store.verified = true;
    const service = new OAuthInteractionService(gateway, store, new RecordingLogger());
    const { request, response } = createTransport();

    await expect(service.resetVerification(request, response)).resolves.toBeUndefined();
    expect(store.resets).toEqual(['interaction-id']);
    expect(store.allocations).toEqual(['interaction-id']);
  });

  it('keeps the current state when the rejection races a completed finalization', async (): Promise<void> => {
    const gateway = new RecordingGateway();
    const store = new FinalizationStore();
    store.resetResult = false;
    const service = new OAuthInteractionService(gateway, store, new RecordingLogger());
    const { request, response } = createTransport();

    await expect(service.resetVerification(request, response)).resolves.toBeUndefined();
    expect(store.resets).toEqual(['interaction-id']);
    expect(store.allocations).toEqual([]);
  });

  it('rejects a not-you URL that is not bound to the active signed session', async (): Promise<void> => {
    const service = new OAuthInteractionService(
      new RecordingGateway(),
      new FinalizationStore(),
      new RecordingLogger(),
    );
    const { request, response } = createTransport();

    await expect(
      service.resetVerification(request, response, 'different-interaction'),
    ).rejects.toThrow('does not match the active session');
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

  it('offers Microsoft verification only when enabled and permitted by acr_values', async (): Promise<void> => {
    const gateway = new RecordingGateway();
    const store = new FinalizationStore();
    const service = new OAuthInteractionService(
      gateway,
      store,
      new RecordingLogger(),
      undefined,
      true,
    );
    const offered = createTransport();

    await expect(service.start(offered.request, offered.response)).resolves.toMatchObject({
      allowsMicrosoftVerification: true,
    });
    const prepared = createTransport();
    await expect(
      service.prepareMicrosoft(prepared.request, prepared.response, 'interaction-id'),
    ).resolves.toEqual({ interactionId: 'interaction-id' });

    gateway.context = {
      ...gateway.context,
      acrValues: 'urn:craftlogin:minecraft-profile-skin',
    };
    const restricted = createTransport();
    await expect(service.start(restricted.request, restricted.response)).resolves.toMatchObject({
      allowsMicrosoftVerification: false,
    });
    const denied = createTransport();
    await expect(service.prepareMicrosoft(denied.request, denied.response)).rejects.toThrow(
      'does not permit Microsoft OAuth verification',
    );
  });

  it('prepares the Microsoft callback without request cookies', async (): Promise<void> => {
    const gateway = new RecordingGateway();
    const store = new FinalizationStore();
    const service = new OAuthInteractionService(
      gateway,
      store,
      new RecordingLogger(),
      undefined,
      true,
    );

    await expect(service.prepareMicrosoftCallback('interaction-id')).resolves.toEqual({
      interactionId: 'interaction-id',
    });
    expect(store.allocations).toEqual(['interaction-id']);

    await expect(service.prepareMicrosoftCallback('unknown-id')).rejects.toThrow(
      'The OIDC interaction is no longer available',
    );

    gateway.context = { ...gateway.context, promptName: 'consent' };
    await expect(service.prepareMicrosoftCallback('interaction-id')).rejects.toThrow(
      'Verification requires a login interaction',
    );

    gateway.context = {
      clientId: 'test-client',
      interactionId: 'interaction-id',
      promptName: 'login',
      promptDetails: {},
      scope: 'openid profile',
      acrValues: 'urn:craftlogin:minecraft-profile-skin',
    };
    await expect(service.prepareMicrosoftCallback('interaction-id')).rejects.toThrow(
      'does not permit Microsoft OAuth verification',
    );
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

  it('requires the in-game confirmation code before finalizing an online-mode join', async (): Promise<void> => {
    const gateway = new RecordingGateway();
    const store = new FinalizationStore();
    store.verified = true;
    store.confirmCode = 'K7X2QM';
    const service = new OAuthInteractionService(gateway, store, new RecordingLogger());
    const { request, response } = createTransport();

    // start() surfaces the requirement without exposing the code itself.
    await expect(service.start(request, response)).resolves.toMatchObject({
      requiresConfirmCode: true,
      verifiedPlayer: player,
    });

    await expect(service.complete(request, response)).resolves.toEqual({
      status: 'code_mismatch',
    });
    await expect(service.complete(request, response, 'interaction-id', 'ZZZZ99')).resolves.toEqual({
      status: 'code_mismatch',
    });
    expect(gateway.persisted).toBe(0);

    await expect(service.complete(request, response, 'interaction-id', 'K7X2QM')).resolves.toEqual({
      status: 'complete',
      redirectTo: '/oauth2/resume',
    });
    expect(gateway.persisted).toBe(1);
  });

  it('expires the interaction once confirmation attempts run out', async (): Promise<void> => {
    const gateway = new RecordingGateway();
    const store = new FinalizationStore();
    store.verified = true;
    store.confirmCode = 'K7X2QM';
    const service = new OAuthInteractionService(gateway, store, new RecordingLogger());
    const { request, response } = createTransport();

    for (let attempt = 0; attempt < 9; attempt += 1) {
      await expect(
        service.complete(request, response, 'interaction-id', 'ZZZZ99'),
      ).resolves.toEqual({ status: 'code_mismatch' });
    }
    await expect(service.complete(request, response, 'interaction-id', 'ZZZZ99')).resolves.toEqual({
      status: 'expired',
    });
    expect(gateway.persisted).toBe(0);
  });

  it('passes the client display name into the verification allocation', async (): Promise<void> => {
    const gateway = new RecordingGateway();
    const store = new FinalizationStore();
    const service = new OAuthInteractionService(
      gateway,
      store,
      new RecordingLogger(),
      undefined,
      false,
      {
        findClient: (clientId: string): Promise<{ name: string } | undefined> =>
          Promise.resolve(clientId === 'test-client' ? { name: 'Example App' } : undefined),
      },
    );
    const { request, response } = createTransport();

    await service.start(request, response);
    expect(store.allocatedClientNames).toEqual(['Example App']);
  });

  it('verifies without a client name when the lookup fails', async (): Promise<void> => {
    const gateway = new RecordingGateway();
    const store = new FinalizationStore();
    const logger = new RecordingLogger();
    const service = new OAuthInteractionService(gateway, store, logger, undefined, false, {
      findClient: (): Promise<never> => Promise.reject(new Error('directory down')),
    });
    const { request, response } = createTransport();

    await expect(service.start(request, response)).resolves.toMatchObject({ code: 'ABCDEFGH' });
    expect(store.allocatedClientNames).toEqual([undefined]);
    expect(logger.errorKinds).toEqual(['Error']);
  });
});

function createTransport(): { request: IncomingMessage; response: ServerResponse } {
  const request = new IncomingMessage(new Socket());
  return { request, response: new ServerResponse(request) };
}
