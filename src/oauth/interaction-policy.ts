import { interactionPolicy } from 'oidc-provider';

import { english } from '../locales/en.js';

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
  return policy;
}
