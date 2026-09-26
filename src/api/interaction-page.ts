import { english } from '../locales/en.js';
import type { SkinInteractionChallenge } from '../oauth/interaction-service.js';
import type { AuthenticatedMinecraftPlayer } from '../verification/types.js';
import { renderSignInPage, type ConsentPermission } from './ui/sign-in-page.js';

export interface InteractionOwner {
  readonly avatarUrl: string;
  readonly name: string;
}

export interface InteractionPageInput {
  readonly appIconUrl?: string;
  readonly appName: string;
  readonly appVerified?: boolean;
  readonly code?: string;
  readonly interactionId: string;
  readonly minecraftBaseDomain: string;
  readonly scope: string;
  readonly kind: 'consent' | 'login';
  readonly accountName?: string;
  readonly accountAvatarUrl?: string;
  readonly owner?: InteractionOwner;
  readonly skinChallenge?: SkinInteractionChallenge;
  readonly allowsSkinVerification?: boolean;
  readonly allowsOnlineVerification?: boolean;
  readonly allowsMicrosoftVerification?: boolean;
  readonly verifiedPlayer?: AuthenticatedMinecraftPlayer;
}

const KNOWN_SCOPE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  offline_access: english.interaction.scopeOffline,
  openid: english.interaction.scopeIdentity,
  profile: english.interaction.scopeProfile,
};

export function permissionsForScope(scope: string): readonly ConsentPermission[] {
  const tokens = scope.split(/\s+/u).filter((token): boolean => token.length > 0);
  const tokenSet = new Set(tokens);
  const hasOpenId = tokenSet.has('openid');
  const hasProfile = tokenSet.has('profile');

  const permissions: ConsentPermission[] = [];
  const processed = new Set<string>();

  for (const name of tokens) {
    if (processed.has(name)) {
      continue;
    }
    if ((name === 'openid' || name === 'profile') && hasOpenId && hasProfile) {
      if (!processed.has('openid') && !processed.has('profile')) {
        permissions.push({ kind: 'text', text: english.interaction.scopeIdentityCombined });
      }
      processed.add('openid');
      processed.add('profile');
      continue;
    }
    processed.add(name);
    const description = KNOWN_SCOPE_DESCRIPTIONS[name];
    permissions.push(
      description === undefined
        ? { code: name, kind: 'code' }
        : { kind: 'text', text: description },
    );
  }
  return permissions;
}

export function renderInteractionPage(input: InteractionPageInput): string {
  const interactionPath = `/interaction/${encodeURIComponent(input.interactionId)}`;
  const strings = english.interaction;
  const skin = strings.skin;

  const isConsent = input.kind === 'consent';
  // A verified player waits for an explicit continue/not-you decision, so the
  // method chooser and per-method panels stay hidden on the confirmation page.
  const isVerified = input.verifiedPlayer !== undefined;
  const allowsOnlineVerification = input.allowsOnlineVerification !== false;
  const skinChallenge = input.skinChallenge;
  // A skin-verification-only client never sees the join address, so its status is the skin status.
  const verification =
    isConsent || isVerified || !allowsOnlineVerification
      ? undefined
      : {
          // During the in-flight 'processing' window no code is rendered; the
          // status poller keeps running and reloads once verification resolves.
          ...(input.code === undefined
            ? {}
            : { address: `${input.code}.${input.minecraftBaseDomain}` }),
          initialStatus: strings.status.pending,
          initialStatusState: 'pending',
          statusUrl: `${interactionPath}/status`,
          steps: strings.steps,
          stepsHeading: strings.stepsHeading,
        };

  const methodChoices = [
    ...(allowsOnlineVerification
      ? [
          {
            detail: strings.methods.online.detail,
            id: 'online',
            label: strings.methods.online.label,
          },
        ]
      : []),
    ...(input.allowsMicrosoftVerification === true
      ? [
          {
            detail: strings.methods.microsoft.detail,
            id: 'microsoft',
            label: strings.methods.microsoft.label,
          },
        ]
      : []),
    ...(input.allowsSkinVerification === true
      ? [{ detail: strings.methods.skin.detail, id: 'skin', label: strings.methods.skin.label }]
      : []),
  ];

  return renderSignInPage({
    ...(input.accountAvatarUrl === undefined ? {} : { accountAvatarUrl: input.accountAvatarUrl }),
    ...(input.owner === undefined ? {} : { owner: input.owner }),
    accountLabel: strings.signedInAs,
    ...(input.accountName === undefined ? {} : { accountName: input.accountName }),
    action: `${interactionPath}/complete`,
    allowsHeading: strings.allowsHeading,
    ...(input.appIconUrl === undefined ? {} : { appIconUrl: input.appIconUrl }),
    appName: input.appName,
    ...(input.appVerified === true ? { appVerified: true } : {}),
    brand: strings.brand,
    cancel: { action: `${interactionPath}/abort`, label: strings.cancelButton },
    continueLabel: isVerified ? strings.confirmation.continueButton : strings.continueButton,
    copiedLabel: strings.copied,
    copyLabel: strings.copyAddress,
    disallowed: strings.disallowed,
    disallowedHeading: strings.disallowedHeading,
    documentTitle: `${input.appName} · ${strings.title}`,
    heading: strings.heading,
    lead: isConsent ? strings.consentLead : strings.lead,
    messages: strings.status,
    noJavaScript: strings.noJavaScript,
    ownerBy: strings.ownerBy,
    ownerLabel: strings.ownerLabel,
    ...(isConsent || isVerified || methodChoices.length < 2 ? {} : { methodChoices }),
    methodHeading: strings.methodHeading,
    ...(skinChallenge === undefined ? {} : { selectedMethod: 'skin' }),
    ...(input.verifiedPlayer === undefined
      ? {}
      : {
          verifiedIdentity: {
            avatarUrl: `/api/avatars/${encodeURIComponent(input.verifiedPlayer.uuid)}/face?size=64&layers=all`,
            heading: strings.confirmation.heading,
            lead: strings.confirmation.lead,
            name: input.verifiedPlayer.username,
            notYou: {
              action: `${interactionPath}/not-you`,
              label: strings.confirmation.notYou,
            },
            signedInAsLabel: strings.signedInAs,
          },
        }),
    ...(isConsent || isVerified || input.allowsMicrosoftVerification !== true
      ? {}
      : {
          microsoftVerification: {
            heading: strings.microsoft.heading,
            hint: strings.microsoft.hint,
            startAction: `${interactionPath}/microsoft/start`,
            startLabel: strings.microsoft.startButton,
          },
        }),
    permissions: permissionsForScope(input.scope),
    ...(isConsent
      ? { switchAccount: { action: `${interactionPath}/switch`, label: strings.changeAccount } }
      : {}),
    ...(verification === undefined ? {} : { verification }),
    ...(isConsent || isVerified || input.allowsSkinVerification !== true
      ? {}
      : {
          skinVerification: {
            accountLabel: skin.accountLabel,
            accountPlaceholder: skin.accountPlaceholder,
            avatarUrlTemplate: '/api/avatars/{uuid}/face?size=64&layers=all',
            heading: skin.heading,
            hint: skin.startHint,
            lookupFoundMessage: skin.lookupFound,
            lookupNotFoundMessage: skin.lookupNotFound,
            lookupSkinMessage: skin.lookupSkin,
            lookupUnavailableMessage: skin.lookupUnavailable,
            lookupUrl: `${interactionPath}/skin/lookup`,
            statusMessages:
              skinChallenge === undefined
                ? strings.status
                : { ...strings.status, pending: skin.statusPending },
            ...(skinChallenge === undefined
              ? {}
              : {
                  status: {
                    initialStatus: skin.statusPending,
                    initialStatusState: 'pending',
                    method: 'skin' as const,
                    statusUrl: `${interactionPath}/skin/status`,
                  },
                }),
            startAction: `${interactionPath}/skin/start`,
            startLabel: skin.startButton,
            ...(skinChallenge === undefined
              ? {}
              : {
                  challenge: {
                    changeSkinLabel: skin.changeSkinButton,
                    changeSkinUrl: skin.changeSkinUrl,
                    downloadLabel: skin.downloadButton,
                    downloadUrl: `${interactionPath}/skin/download`,
                    originalDownloadLabel: skin.originalDownloadButton,
                    originalDownloadUrl: `${interactionPath}/skin/original-download`,
                    format: skinChallenge.height === 32 ? skin.formatLegacy : skin.formatModern,
                    formatLabel: skin.formatLabel,
                    model: skinChallenge.model === 'slim' ? skin.modelSlim : skin.modelClassic,
                    modelLabel: skin.modelLabel,
                    steps: skin.steps,
                    username: skinChallenge.username,
                    usernameLabel: skin.usernameLabel,
                  },
                }),
          },
        }),
  });
}
