import { errors as oidcErrors } from 'oidc-provider';
import { describe, expect, it } from 'vitest';

import {
  asInteractionStateError,
  OAuthInteractionStateError,
} from '../../src/oauth/interaction-gateway.js';

describe('expired OIDC interaction mapping', (): void => {
  it('converts the provider SessionNotFound into a shared state error', (): void => {
    const expired = new oidcErrors.SessionNotFound('interaction is gone');

    const mapped = asInteractionStateError(expired);

    expect(mapped).toBeInstanceOf(OAuthInteractionStateError);
    expect(mapped).toMatchObject({ cause: expired });
  });

  it('leaves unrelated provider failures untouched', (): void => {
    const failure = new Error('provider exploded');

    expect(asInteractionStateError(failure)).toBe(failure);
  });
});
