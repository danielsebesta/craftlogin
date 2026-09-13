import type { IncomingMessage, ServerResponse } from 'node:http';

import type {
  RedisVerificationStore,
  VerificationFinalizationClaim,
} from '../verification/redis-verification-store.js';
import type { VerificationStatus } from '../verification/types.js';
import type { SkinVerificationChallenge } from '../verification/redis-skin-verification-store.js';
import { getErrorKind } from '../logging/error-kind.js';
import type { OAuthInteractionContext, OAuthInteractionGateway } from './interaction-gateway.js';
import { OAuthInteractionStateError } from './interaction-gateway.js';
import { MINECRAFT_ONLINE_MODE_ACR, MINECRAFT_PROFILE_SKIN_ACR } from './constants.js';

interface VerificationInteractionStore {
  allocate(interactionId: string): Promise<string>;
  claimVerified(interactionId: string): Promise<VerificationFinalizationClaim | null>;
  completeFinalization(claim: VerificationFinalizationClaim): Promise<boolean>;
  getStatus(interactionId: string): Promise<VerificationStatus>;
  releaseFinalization(claim: VerificationFinalizationClaim): Promise<boolean>;
}

interface SkinInteractionVerification {
  check(interactionId: string): Promise<VerificationStatus>;
  getChallenge(interactionId: string): Promise<SkinVerificationChallenge | undefined>;
  start(interactionId: string, username: string): Promise<SkinVerificationChallenge>;
}

export interface SkinInteractionChallenge {
  readonly height: 32 | 64;
  readonly model: 'classic' | 'slim';
  readonly username: string;
}

export interface OAuthInteractionLogger {
  error(bindings: { readonly errorKind: string }, message: string): void;
}

export interface PendingOAuthInteraction {
  readonly clientId: string;
  readonly interactionId: string;
  readonly scope: string;
  readonly kind: 'consent' | 'login';
  readonly accountId?: string;
  readonly code?: string;
  readonly skinChallenge?: SkinInteractionChallenge;
  readonly allowsSkinVerification?: boolean;
  readonly allowsOnlineVerification?: boolean;
}

export type OAuthInteractionCompletion =
  { status: 'complete'; redirectTo: string } | { status: 'expired' | 'pending' };

export interface OAuthInteractionAbortion {
  readonly redirectTo: string;
}

export class OAuthInteractionService {
  public constructor(
    private readonly gateway: OAuthInteractionGateway,
    private readonly verification:
      | Pick<
          RedisVerificationStore,
          | 'allocate'
          | 'claimVerified'
          | 'completeFinalization'
          | 'getStatus'
          | 'releaseFinalization'
        >
      | VerificationInteractionStore,
    private readonly logger: OAuthInteractionLogger,
    private readonly skinVerification?: SkinInteractionVerification,
  ) {}

  public async start(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<PendingOAuthInteraction> {
    const interaction = await this.requireActiveInteraction(
      request,
      response,
      expectedInteractionId,
    );
    if (interaction.promptName === 'consent') {
      if (interaction.sessionAccountId === undefined) {
        throw new OAuthInteractionStateError(
          'The consent interaction has no authenticated account',
        );
      }
      return {
        accountId: interaction.sessionAccountId,
        clientId: interaction.clientId,
        interactionId: interaction.interactionId,
        kind: 'consent',
        scope: consentScope(interaction),
      };
    }
    if (interaction.promptName !== 'login') {
      throw new OAuthInteractionStateError('The OIDC interaction prompt is not supported');
    }
    const code = await this.verification.allocate(interaction.interactionId);
    const skinChallenge = await this.readSkinChallenge(interaction.interactionId);
    const allowsSkinVerification = this.allowsSkinVerification(interaction);
    const allowsOnlineVerification = permitsAuthenticationMethod(
      interaction,
      MINECRAFT_ONLINE_MODE_ACR,
    );
    return {
      clientId: interaction.clientId,
      ...(allowsOnlineVerification ? { code } : {}),
      interactionId: interaction.interactionId,
      kind: 'login',
      scope: interaction.scope,
      ...(skinChallenge === undefined ? {} : { skinChallenge }),
      allowsSkinVerification,
      allowsOnlineVerification,
    };
  }

  public async startSkin(
    request: IncomingMessage,
    response: ServerResponse,
    username: string,
    expectedInteractionId?: string,
  ): Promise<SkinInteractionChallenge> {
    const interaction = await this.requireLoginInteraction(
      request,
      response,
      expectedInteractionId,
    );
    if (this.skinVerification === undefined) {
      throw new OAuthInteractionStateError('Skin verification is not available');
    }
    if (!this.allowsSkinVerification(interaction)) {
      throw new OAuthInteractionStateError(
        'The authorization request requires a different authentication method',
      );
    }
    await this.verification.allocate(interaction.interactionId);
    return toSkinInteractionChallenge(
      await this.skinVerification.start(interaction.interactionId, username),
    );
  }

  public async getSkinChallenge(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<SkinVerificationChallenge | undefined> {
    const interaction = await this.requireLoginInteraction(
      request,
      response,
      expectedInteractionId,
    );
    return await this.skinVerification?.getChallenge(interaction.interactionId);
  }

  public async checkSkin(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<VerificationStatus> {
    const interaction = await this.requireLoginInteraction(
      request,
      response,
      expectedInteractionId,
    );
    if (this.skinVerification === undefined) {
      throw new OAuthInteractionStateError('Skin verification is not available');
    }
    return await this.skinVerification.check(interaction.interactionId);
  }

  public async abort(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<OAuthInteractionAbortion> {
    await this.requireActiveInteraction(request, response, expectedInteractionId);
    const redirectTo = await this.gateway.abort(request, response);
    return { redirectTo };
  }

  public async switchAccount(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<OAuthInteractionAbortion> {
    const interaction = await this.requireActiveInteraction(
      request,
      response,
      expectedInteractionId,
    );
    if (interaction.promptName !== 'consent' || this.gateway.switchAccount === undefined) {
      throw new OAuthInteractionStateError(
        'The account switch is not available for this interaction',
      );
    }
    return { redirectTo: await this.gateway.switchAccount(request, response) };
  }

  public async status(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<VerificationStatus> {
    const interaction = await this.requireActiveInteraction(
      request,
      response,
      expectedInteractionId,
    );
    if (interaction.promptName !== 'login') {
      throw new OAuthInteractionStateError(
        'The consent interaction has no Minecraft verification status',
      );
    }
    return await this.verification.getStatus(interaction.interactionId);
  }

  public async complete(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<OAuthInteractionCompletion> {
    const interaction = await this.requireActiveInteraction(
      request,
      response,
      expectedInteractionId,
    );
    if (interaction.promptName === 'consent') {
      if (this.gateway.persistConsent === undefined) {
        throw new OAuthInteractionStateError('The OIDC consent interaction is not supported');
      }
      return {
        status: 'complete',
        redirectTo: await this.gateway.persistConsent(request, response, interaction.interactionId),
      };
    }
    if (interaction.promptName !== 'login') {
      throw new OAuthInteractionStateError('The OIDC interaction prompt is not supported');
    }
    const claim = await this.verification.claimVerified(interaction.interactionId);
    if (claim === null) {
      const status = await this.verification.getStatus(interaction.interactionId);
      return { status: status.status === 'expired' ? 'expired' : 'pending' };
    }

    let redirectTo: string;
    try {
      redirectTo = await this.gateway.persistVerifiedResult(
        request,
        response,
        interaction.interactionId,
        claim.player,
        claim.resolvedAt,
        claim.method,
      );
    } catch (error: unknown) {
      await this.releaseFailedFinalization(claim);
      throw error;
    }

    try {
      if (!(await this.verification.completeFinalization(claim))) {
        this.logger.error(
          { errorKind: 'VerificationFinalizationClaimLost' },
          'Verified OIDC interaction cleanup was not applied',
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        { errorKind: getErrorKind(error) },
        'Verified OIDC interaction cleanup failed',
      );
    }

    return { status: 'complete', redirectTo };
  }

  private async requireActiveInteraction(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<OAuthInteractionContext> {
    const interaction = await this.gateway.inspect(request, response);
    if (interaction.promptName !== 'login' && interaction.promptName !== 'consent') {
      throw new OAuthInteractionStateError('The OIDC interaction prompt is not supported');
    }
    if (
      expectedInteractionId !== undefined &&
      interaction.interactionId !== expectedInteractionId
    ) {
      throw new OAuthInteractionStateError('The interaction URL does not match the active session');
    }
    return interaction;
  }

  private async requireLoginInteraction(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<OAuthInteractionContext> {
    const interaction = await this.requireActiveInteraction(
      request,
      response,
      expectedInteractionId,
    );
    if (interaction.promptName !== 'login') {
      throw new OAuthInteractionStateError('Skin verification requires a login interaction');
    }
    return interaction;
  }

  private async readSkinChallenge(
    interactionId: string,
  ): Promise<SkinInteractionChallenge | undefined> {
    const challenge = await this.skinVerification?.getChallenge(interactionId);
    return challenge === undefined ? undefined : toSkinInteractionChallenge(challenge);
  }

  private allowsSkinVerification(interaction: OAuthInteractionContext): boolean {
    if (this.skinVerification === undefined) {
      return false;
    }
    return permitsAuthenticationMethod(interaction, MINECRAFT_PROFILE_SKIN_ACR);
  }

  private async releaseFailedFinalization(claim: VerificationFinalizationClaim): Promise<void> {
    try {
      if (!(await this.verification.releaseFinalization(claim))) {
        this.logger.error(
          { errorKind: 'VerificationFinalizationClaimLost' },
          'Failed OIDC interaction claim could not be released',
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        { errorKind: getErrorKind(error) },
        'Failed OIDC interaction claim release failed',
      );
    }
  }
}

function permitsAuthenticationMethod(
  interaction: OAuthInteractionContext,
  method: string,
): boolean {
  const requested = interaction.acrValues;
  return requested === undefined || requested.split(/\s+/u).includes(method);
}

function toSkinInteractionChallenge(
  challenge: SkinVerificationChallenge,
): SkinInteractionChallenge {
  return {
    height: challenge.height,
    model: challenge.model,
    username: challenge.username,
  };
}

function consentScope(interaction: OAuthInteractionContext): string {
  const scope = interaction.promptDetails.missingOIDCScope;
  return scope === undefined || scope.length === 0 ? interaction.scope : scope.join(' ');
}
