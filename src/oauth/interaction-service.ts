import type { IncomingMessage, ServerResponse } from 'node:http';

import type {
  RedisVerificationStore,
  VerificationFinalizationClaim,
} from '../verification/redis-verification-store.js';
import type { VerificationStatus } from '../verification/types.js';
import { getErrorKind } from '../logging/error-kind.js';
import type { OAuthInteractionContext, OAuthInteractionGateway } from './interaction-gateway.js';
import { OAuthInteractionStateError } from './interaction-gateway.js';

interface VerificationInteractionStore {
  allocate(interactionId: string): Promise<string>;
  claimVerified(interactionId: string): Promise<VerificationFinalizationClaim | null>;
  completeFinalization(claim: VerificationFinalizationClaim): Promise<boolean>;
  getStatus(interactionId: string): Promise<VerificationStatus>;
  releaseFinalization(claim: VerificationFinalizationClaim): Promise<boolean>;
}

export interface OAuthInteractionLogger {
  error(bindings: { readonly errorKind: string }, message: string): void;
}

export interface PendingOAuthInteraction {
  readonly clientId: string;
  readonly code: string;
  readonly interactionId: string;
  readonly scope: string;
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
  ) {}

  public async start(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<PendingOAuthInteraction> {
    const interaction = await this.requireLoginInteraction(
      request,
      response,
      expectedInteractionId,
    );
    const code = await this.verification.allocate(interaction.interactionId);
    return {
      clientId: interaction.clientId,
      code,
      interactionId: interaction.interactionId,
      scope: interaction.scope,
    };
  }

  public async abort(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<OAuthInteractionAbortion> {
    await this.requireLoginInteraction(request, response, expectedInteractionId);
    const redirectTo = await this.gateway.abort(request, response);
    return { redirectTo };
  }

  public async status(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<VerificationStatus> {
    const interaction = await this.requireLoginInteraction(
      request,
      response,
      expectedInteractionId,
    );
    return await this.verification.getStatus(interaction.interactionId);
  }

  public async complete(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<OAuthInteractionCompletion> {
    const interaction = await this.requireLoginInteraction(
      request,
      response,
      expectedInteractionId,
    );
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

  private async requireLoginInteraction(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<OAuthInteractionContext> {
    const interaction = await this.gateway.inspect(request, response);
    if (interaction.promptName !== 'login') {
      throw new OAuthInteractionStateError('The OIDC interaction is not awaiting authentication');
    }
    if (
      expectedInteractionId !== undefined &&
      interaction.interactionId !== expectedInteractionId
    ) {
      throw new OAuthInteractionStateError('The interaction URL does not match the active session');
    }
    return interaction;
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
