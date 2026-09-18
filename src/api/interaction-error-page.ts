import { english } from '../locales/en.js';
import { renderOAuthErrorPage } from './ui/oauth-error-page.js';

export type InteractionErrorKind = 'expired' | 'invalid';

export function renderInteractionErrorPage(kind: InteractionErrorKind): string {
  const interaction = english.interaction;
  const heading =
    kind === 'expired' ? interaction.expiredHeading : english.authorizationError.heading;
  const lead =
    kind === 'expired' ? english.api.errors.interactionExpired : english.authorizationError.message;

  return renderOAuthErrorPage({
    action: { kind: 'back', label: interaction.goBack },
    brand: interaction.brand,
    footer: interaction.footer,
    heading,
    lead,
    title: heading,
  });
}
