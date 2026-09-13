import { english } from '../locales/en.js';
import { renderSignInPage, type ConsentPermission } from './ui/sign-in-page.js';
import type { SkinInteractionChallenge } from '../oauth/interaction-service.js';

export interface InteractionPageInput {
  readonly appName: string;
  readonly code?: string;
  readonly interactionId: string;
  readonly minecraftBaseDomain: string;
  readonly scope: string;
  readonly kind: 'consent' | 'login';
  readonly accountName?: string;
  readonly accountAvatarUrl?: string;
  readonly skinChallenge?: SkinInteractionChallenge;
  readonly allowsSkinVerification?: boolean;
  readonly allowsOnlineVerification?: boolean;
}

const KNOWN_SCOPE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  offline_access: english.interaction.scopeOffline,
  openid: english.interaction.scopeIdentity,
  profile: english.interaction.scopeProfile,
};

export function permissionsForScope(scope: string): readonly ConsentPermission[] {
  const seen = new Set<string>();
  const permissions: ConsentPermission[] = [];
  for (const name of scope.split(/\s+/u)) {
    if (name.length === 0 || seen.has(name)) {
      continue;
    }
    seen.add(name);
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

  const isConsent = input.kind === 'consent';
  const allowsOnlineVerification = input.allowsOnlineVerification !== false;
  const verification =
    isConsent || (!allowsOnlineVerification && input.skinChallenge === undefined)
      ? undefined
      : {
          ...(allowsOnlineVerification
            ? {
                address: `${input.code ?? ''}.${input.minecraftBaseDomain}`,
                addressLabel: strings.addressLabel,
                steps: strings.steps,
                stepsHeading: strings.stepsHeading,
              }
            : {}),
          initialStatus:
            input.skinChallenge === undefined ? strings.status.pending : strings.skin.statusPending,
          initialStatusState: 'pending',
          statusUrl:
            input.skinChallenge === undefined
              ? `${interactionPath}/status`
              : `${interactionPath}/skin/status`,
        };
  return renderSignInPage({
    action: `${interactionPath}/complete`,
    allowsHeading: strings.allowsHeading,
    appName: input.appName,
    ...(input.accountName === undefined ? {} : { accountName: input.accountName }),
    ...(input.accountAvatarUrl === undefined ? {} : { accountAvatarUrl: input.accountAvatarUrl }),
    brand: strings.brand,
    cancel: { action: `${interactionPath}/abort`, label: strings.cancelButton },
    ...(isConsent
      ? { switchAccount: { action: `${interactionPath}/switch`, label: strings.changeAccount } }
      : {}),
    continueLabel: strings.continueButton,
    copiedLabel: strings.copied,
    copyLabel: strings.copyAddress,
    documentTitle: `${input.appName} · ${strings.title}`,
    footer: strings.footer,
    heading: strings.heading,
    lead: isConsent ? strings.consentLead : strings.lead,
    messages:
      input.skinChallenge === undefined
        ? strings.status
        : { ...strings.status, pending: strings.skin.statusPending },
    noJavaScript: strings.noJavaScript,
    permissions: permissionsForScope(input.scope),
    securityNote: strings.securityNote,
    skipLabel: english.common.skipToContent,
    ...(verification === undefined ? {} : { verification }),
    ...(isConsent || input.allowsSkinVerification !== true
      ? {}
      : {
          skinVerification: {
            accountLabel: strings.skin.accountLabel,
            accountPlaceholder: strings.skin.accountPlaceholder,
            ...(input.skinChallenge === undefined
              ? {}
              : {
                  challenge: {
                    downloadLabel: strings.skin.downloadButton,
                    downloadUrl: `${interactionPath}/skin/download`,
                    format:
                      input.skinChallenge.height === 32
                        ? strings.skin.formatLegacy
                        : strings.skin.formatModern,
                    model:
                      input.skinChallenge.model === 'slim'
                        ? strings.skin.modelSlim
                        : strings.skin.modelClassic,
                    steps: strings.skin.steps,
                    username: input.skinChallenge.username,
                    verificationFor: strings.skin.verificationFor,
                  },
                }),
            heading: strings.skin.heading,
            hint: strings.skin.startHint,
            startAction: `${interactionPath}/skin/start`,
            startLabel: strings.skin.startButton,
          },
        }),
  });
}
