import { english } from '../locales/en.js';
import { renderSignInPage } from './ui/sign-in-page.js';

export interface InteractionPageInput {
  readonly appName: string;
  readonly code: string;
  readonly interactionId: string;
  readonly minecraftBaseDomain: string;
}

export function renderInteractionPage(input: InteractionPageInput): string {
  const interactionPath = `/interaction/${encodeURIComponent(input.interactionId)}`;
  const strings = english.interaction;

  return renderSignInPage({
    action: `${interactionPath}/complete`,
    address: `${input.code}.${input.minecraftBaseDomain}`,
    addressLabel: strings.addressLabel,
    appName: input.appName,
    brand: strings.brand,
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
    securityNote: strings.securityNote,
    skipLabel: english.common.skipToContent,
    statusUrl: `${interactionPath}/status`,
    steps: strings.steps,
    stepsHeading: strings.stepsHeading,
  });
}
