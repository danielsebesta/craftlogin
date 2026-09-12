import { english } from '../locales/en.js';
import { renderSignInPage, type ConsentPermission } from './ui/sign-in-page.js';

export interface InteractionPageInput {
  readonly appName: string;
  readonly code: string;
  readonly interactionId: string;
  readonly minecraftBaseDomain: string;
  readonly scope: string;
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
      description === undefined ? { code: name, kind: 'code' } : { kind: 'text', text: description },
    );
  }
  return permissions;
}

export function renderInteractionPage(input: InteractionPageInput): string {
  const interactionPath = `/interaction/${encodeURIComponent(input.interactionId)}`;
  const strings = english.interaction;

  return renderSignInPage({
    action: `${interactionPath}/complete`,
    address: `${input.code}.${input.minecraftBaseDomain}`,
    addressLabel: strings.addressLabel,
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
    initialStatus: strings.status.pending,
    initialStatusState: 'pending',
    lead: strings.lead,
    messages: strings.status,
    noJavaScript: strings.noJavaScript,
    permissions: permissionsForScope(input.scope),
    securityNote: strings.securityNote,
    skipLabel: english.common.skipToContent,
    statusUrl: `${interactionPath}/status`,
    steps: strings.steps,
    stepsHeading: strings.stepsHeading,
  });
}
