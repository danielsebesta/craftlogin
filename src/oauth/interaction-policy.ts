import { interactionPolicy } from 'oidc-provider';

import { english } from '../locales/en.js';
import { permitsAuthenticationContext } from './authentication-context.js';

export function createMinecraftInteractionPolicy(): interactionPolicy.DefaultPolicy {
  const policy = interactionPolicy.base();
  const login = policy.get('login');
  if (login === undefined) {
    throw new Error('oidc-provider did not supply its required login prompt');
  }

  login.checks.remove('no_session');
  login.checks.add(
    new interactionPolicy.Check(
      'minecraft_verification',
      english.interaction.interactionRequired,
      ({ oidc }): boolean =>
        oidc.session?.accountId === undefined
          ? interactionPolicy.Check.REQUEST_PROMPT
          : interactionPolicy.Check.NO_NEED_TO_PROMPT,
      (): { authenticationMethod: string } => ({
        authenticationMethod: 'minecraft_online_mode',
      }),
    ),
    1,
  );
  // acr_values is only voluntary in OIDC, so an existing session would otherwise
  // satisfy a stricter client with whichever method created it.
  login.checks.add(
    new interactionPolicy.Check(
      'minecraft_authentication_context',
      english.interaction.interactionRequired,
      ({ oidc }): boolean => {
        const requested = oidc.params?.['acr_values'];
        // A session created without a method has no acr, whatever the types say.
        const current: unknown = oidc.acr;
        return typeof requested !== 'string' ||
          (typeof current === 'string' && permitsAuthenticationContext(requested, current))
          ? interactionPolicy.Check.NO_NEED_TO_PROMPT
          : interactionPolicy.Check.REQUEST_PROMPT;
      },
    ),
  );
  return policy;
}
