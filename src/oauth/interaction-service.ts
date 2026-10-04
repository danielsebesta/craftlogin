import type { IncomingMessage, ServerResponse } from 'node:http';

import type {
  RedisVerificationStore,
  VerificationFinalizationClaim,
  VerifiedClaimResult,
} from '../verification/redis-verification-store.js';
import type { AuthenticatedMinecraftPlayer, VerificationStatus } from '../verification/types.js';
import type { SkinVerificationChallenge } from '../verification/redis-skin-verification-store.js';
import type { SkinVerificationLookup } from '../verification/skin-verification-service.js';
import { getErrorKind } from '../logging/error-kind.js';
import type { OAuthInteractionContext, OAuthInteractionGateway } from './interaction-gateway.js';
import { OAuthInteractionStateError } from './interaction-gateway.js';
import {
  MICROSOFT_OAUTH_ACR,
  MINECRAFT_ONLINE_MODE_ACR,
  MINECRAFT_PROFILE_SKIN_ACR,
} from './constants.js';

interface VerificationInteractionStore {
  allocate(interactionId: string, clientName?: string): Promise<string>;
  claimVerified(interactionId: string, confirmationCode?: string): Promise<VerifiedClaimResult>;
  completeFinalization(claim: VerificationFinalizationClaim): Promise<boolean>;
  getStatus(interactionId: string): Promise<VerificationStatus>;
  releaseFinalization(claim: VerificationFinalizationClaim): Promise<boolean>;
  reset(interactionId: string): Promise<boolean>;
}

export interface InteractionClientNameLookup {
  findClient(clientId: string): Promise<{ readonly name: string } | undefined>;
}

interface SkinInteractionVerification {
  check(interactionId: string): Promise<VerificationStatus>;
  discard(interactionId: string): Promise<void>;
  getChallenge(interactionId: string): Promise<SkinVerificationChallenge | undefined>;
  lookup?(username: string): Promise<SkinVerificationLookup | undefined>;
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
  readonly allowsMicrosoftVerification?: boolean;
  /** True when the in-game kick delivered a confirmation code the browser must echo back. */
  readonly requiresConfirmCode?: boolean;
  /** Server-side verified identity awaiting the user's explicit confirmation. */
  readonly verifiedPlayer?: AuthenticatedMinecraftPlayer;
}

export type OAuthInteractionCompletion =
  { status: 'complete'; redirectTo: string } | { status: 'code_mismatch' | 'expired' | 'pending' };

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
          | 'reset'
        >
      | VerificationInteractionStore,
    private readonly logger: OAuthInteractionLogger,
    private readonly skinVerification?: SkinInteractionVerification,
    private readonly microsoftVerificationEnabled = false,
    private readonly clientNames?: InteractionClientNameLookup,
  ) {}

  public async start(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<PendingOAuthInteraction> {
    const { context: interaction } = await this.requireActiveInteraction(
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
    // A resolved verification waits for an explicit confirm/not-you decision
    // instead of completing automatically.
    const status = await this.verification.getStatus(interaction.interactionId);
    if (status.status === 'verified') {
      return {
        clientId: interaction.clientId,
        interactionId: interaction.interactionId,
        kind: 'login',
        scope: interaction.scope,
        verifiedPlayer: status.player,
        ...(status.requiresConfirmCode === true ? { requiresConfirmCode: true } : {}),
      };
    }
    // 'processing' reports pending without a code; allocating here would collide
    // with the in-flight claim, so the join address stays unset for that window.
    const code =
      status.status === 'pending' && status.code === null
        ? undefined
        : await this.allocateVerification(interaction);
    const skinChallenge = await this.readSkinChallenge(interaction.interactionId);
    const allowsSkinVerification = this.allowsSkinVerification(interaction);
    const allowsOnlineVerification = permitsAuthenticationMethod(
      interaction,
      MINECRAFT_ONLINE_MODE_ACR,
    );
    const allowsMicrosoftVerification =
      this.microsoftVerificationEnabled &&
      permitsAuthenticationMethod(interaction, MICROSOFT_OAUTH_ACR);
    return {
      clientId: interaction.clientId,
      ...(allowsOnlineVerification && code !== undefined ? { code } : {}),
      interactionId: interaction.interactionId,
      kind: 'login',
      scope: interaction.scope,
      ...(skinChallenge === undefined ? {} : { skinChallenge }),
      allowsSkinVerification,
      allowsOnlineVerification,
      ...(this.microsoftVerificationEnabled ? { allowsMicrosoftVerification } : {}),
    };
  }

  public async prepareMicrosoft(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<{ readonly interactionId: string }> {
    const { context: interaction } = await this.requireLoginInteraction(
      request,
      response,
      expectedInteractionId,
    );
    if (
      !this.microsoftVerificationEnabled ||
      !permitsAuthenticationMethod(interaction, MICROSOFT_OAUTH_ACR)
    ) {
      throw new OAuthInteractionStateError(
        'The authorization request does not permit Microsoft OAuth verification',
      );
    }
    await this.allocateVerification(interaction);
    return { interactionId: interaction.interactionId };
  }

  public async prepareMicrosoftCallback(
    interactionId: string,
  ): Promise<{ readonly interactionId: string }> {
    // The callback path sits outside the interaction cookie scope, so resolve
    // by the id bound in the signed transaction cookie; the atomic claim still
    // gives exactly one winner.
    const interaction = await this.gateway.findInteraction(interactionId);
    if (interaction.interactionId !== interactionId || interaction.promptName !== 'login') {
      throw new OAuthInteractionStateError('Verification requires a login interaction');
    }
    if (
      !this.microsoftVerificationEnabled ||
      !permitsAuthenticationMethod(interaction, MICROSOFT_OAUTH_ACR)
    ) {
      throw new OAuthInteractionStateError(
        'The authorization request does not permit Microsoft OAuth verification',
      );
    }
    await this.allocateVerification(interaction);
    return { interactionId: interaction.interactionId };
  }

  public async startSkin(
    request: IncomingMessage,
    response: ServerResponse,
    username: string,
    expectedInteractionId?: string,
  ): Promise<SkinInteractionChallenge> {
    const { context: interaction } = await this.requireLoginInteraction(
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
    await this.allocateVerification(interaction);
    return toSkinInteractionChallenge(
      await this.skinVerification.start(interaction.interactionId, username),
    );
  }

  public async lookupSkin(
    request: IncomingMessage,
    response: ServerResponse,
    username: string,
    expectedInteractionId?: string,
  ): Promise<SkinVerificationLookup | undefined> {
    const { context: interaction } = await this.requireLoginInteraction(
      request,
      response,
      expectedInteractionId,
    );
    if (this.skinVerification?.lookup === undefined || !this.allowsSkinVerification(interaction)) {
      throw new OAuthInteractionStateError('Skin verification is not available');
    }
    return await this.skinVerification.lookup(username);
  }

  public async getSkinChallenge(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<SkinVerificationChallenge | undefined> {
    const { context: interaction } = await this.requireLoginInteraction(
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
    const { context: interaction } = await this.requireLoginInteraction(
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
    const { context: interaction } = await this.requireActiveInteraction(
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

  // Rejecting the verified identity discards the resolved record and
  // re-allocates a fresh code so every method becomes selectable again.
  public async resetVerification(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<void> {
    const { context: interaction } = await this.requireLoginInteraction(
      request,
      response,
      expectedInteractionId,
    );
    // Drop any pending skin challenge first so it cannot re-resolve the fresh
    // record or block a different account's challenge.
    await this.skinVerification?.discard(interaction.interactionId);
    if (await this.verification.reset(interaction.interactionId)) {
      await this.allocateVerification(interaction);
    }
  }

  public async status(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<VerificationStatus> {
    const { context: interaction } = await this.requireActiveInteraction(
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
    confirmationCode?: string,
  ): Promise<OAuthInteractionCompletion> {
    const { context: interaction } = await this.requireActiveInteraction(
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
    const outcome = await this.verification.claimVerified(
      interaction.interactionId,
      confirmationCode,
    );
    if (outcome.status !== 'claimed') {
      if (outcome.status === 'code_mismatch') {
        return { status: 'code_mismatch' };
      }
      // Exhausted guesses deleted the record, so the interaction is finished.
      if (outcome.status === 'attempts_exhausted') {
        return { status: 'expired' };
      }
      const status = await this.verification.getStatus(interaction.interactionId);
      return { status: status.status === 'expired' ? 'expired' : 'pending' };
    }
    const claim = outcome.claim;

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
  ): Promise<{ readonly context: OAuthInteractionContext }> {
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
    return { context: interaction };
  }

  private async requireLoginInteraction(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<{ readonly context: OAuthInteractionContext }> {
    const resolved = await this.requireActiveInteraction(request, response, expectedInteractionId);
    if (resolved.context.promptName !== 'login') {
      throw new OAuthInteractionStateError('Verification requires a login interaction');
    }
    return resolved;
  }

  private async readSkinChallenge(
    interactionId: string,
  ): Promise<SkinInteractionChallenge | undefined> {
    const challenge = await this.skinVerification?.getChallenge(interactionId);
    return challenge === undefined ? undefined : toSkinInteractionChallenge(challenge);
  }

  // The client display name is stored on the pending record so the in-game
  // disconnect can name the application being signed into; a lookup failure
  // degrades to a generic message instead of failing verification.
  private async allocateVerification(interaction: OAuthInteractionContext): Promise<string> {
    return await this.verification.allocate(
      interaction.interactionId,
      await this.resolveClientName(interaction.clientId),
    );
  }

  private async resolveClientName(clientId: string): Promise<string | undefined> {
    if (this.clientNames === undefined) {
      return undefined;
    }
    try {
      return (await this.clientNames.findClient(clientId))?.name;
    } catch (error: unknown) {
      this.logger.error(
        { errorKind: getErrorKind(error) },
        'Interaction client name lookup failed',
      );
      return undefined;
    }
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
