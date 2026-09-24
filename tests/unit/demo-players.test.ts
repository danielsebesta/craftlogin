import { describe, expect, it } from 'vitest';

import { DEMO_PLAYER, formatShowcaseCaption } from '../../src/api/demo-players.js';

describe('demo player showcase', (): void => {
  it('uses a fixed canonical identity with a cape', (): void => {
    expect(DEMO_PLAYER.name).toBe('Dastcz');
    expect(DEMO_PLAYER.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    );
    expect(DEMO_PLAYER.hasCape).toBe(true);
  });

  it('formats the showcase caption with the player name', (): void => {
    expect(formatShowcaseCaption('Showcase skin by {player}.', DEMO_PLAYER)).toBe(
      'Showcase skin by Dastcz.',
    );
  });
});
