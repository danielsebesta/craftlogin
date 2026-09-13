import { english } from '../locales/en.js';
import type { SkinInteractionChallenge } from '../oauth/interaction-service.js';
import { renderSignInPage, type ConsentPermission } from './ui/sign-in-page.js';

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
  const skin = strings.skin;

  const isConsent = input.kind === 'consent';
  const allowsOnlineVerification = input.allowsOnlineVerification !== false;
  const skinChallenge = input.skinChallenge;
  const usesSkinVerification = skinChallenge !== undefined;
  // A client that requests only the skin verification method never sees the
  // Minecraft join address, so its status is the skin status.
  const verification =
    isConsent || (!allowsOnlineVerification && !usesSkinVerification)
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
          initialStatus: usesSkinVerification ? skin.statusPending : strings.status.pending,
          initialStatusState: 'pending',
          statusUrl: usesSkinVerification
            ? `${interactionPath}/skin/status`
            : `${interactionPath}/status`,
        };

  return renderSignInPage({
    ...(input.accountAvatarUrl === undefined ? {} : { accountAvatarUrl: input.accountAvatarUrl }),
    accountLabel: strings.signedInAs,
    ...(input.accountName === undefined ? {} : { accountName: input.accountName }),
    action: `${interactionPath}/complete`,
    allowsHeading: strings.allowsHeading,
    appName: input.appName,
    brand: strings.brand,
    cancel: { action: `${interactionPath}/abort`, label: strings.cancelButton },
    continueLabel: strings.continueButton,
    copiedLabel: strings.copied,
    copyLabel: strings.copyAddress,
    documentTitle: `${input.appName} · ${strings.title}`,
    footer: strings.footer,
    heading: strings.heading,
    lead: isConsent ? strings.consentLead : strings.lead,
    messages:
      skinChallenge === undefined
        ? strings.status
        : { ...strings.status, pending: skin.statusPending },
    noJavaScript: strings.noJavaScript,
    permissions: permissionsForScope(input.scope),
    securityNote: strings.securityNote,
    ...(isConsent
      ? { switchAccount: { action: `${interactionPath}/switch`, label: strings.changeAccount } }
      : {}),
    ...(verification === undefined ? {} : { verification }),
    ...(isConsent || input.allowsSkinVerification !== true
      ? {}
      : {
          skinVerification: {
            accountLabel: skin.accountLabel,
            accountPlaceholder: skin.accountPlaceholder,
            heading: allowsOnlineVerification ? skin.heading : skin.headingAlternative,
            hint: skin.startHint,
            startAction: `${interactionPath}/skin/start`,
            startLabel: skin.startButton,
            ...(skinChallenge === undefined
              ? {}
              : {
                  challenge: {
                    downloadLabel: skin.downloadButton,
                    downloadUrl: `${interactionPath}/skin/download`,
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
