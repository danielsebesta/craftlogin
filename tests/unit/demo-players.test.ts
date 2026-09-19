import { describe, expect, it } from 'vitest';

import {
  DEMO_PLAYERS,
  formatShowcaseCaption,
  selectDemoPlayer,
} from '../../src/api/demo-players.js';

describe('demo player showcase', (): void => {
  it('lists unique canonical UUIDs', (): void => {
    const uuids = DEMO_PLAYERS.map((player): string => player.uuid);
    expect(new Set(uuids).size).toBe(uuids.length);
    for (const uuid of uuids) {
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });

  it('selects deterministically and rotates by day', (): void => {
    const first = selectDemoPlayer(new Date('2026-09-19T12:00:00Z'));
    expect(selectDemoPlayer(new Date('2026-09-19T23:59:59Z'))).toEqual(first);
    expect(selectDemoPlayer(new Date('2026-09-20T00:00:01Z'))).toEqual(
      DEMO_PLAYERS[(DEMO_PLAYERS.indexOf(first) + 1) % DEMO_PLAYERS.length],
    );
  });

  it('formats the showcase caption with the player name', (): void => {
    const player = DEMO_PLAYERS.at(0);
    if (player === undefined) {
      throw new Error('Demo player list is empty');
    }
    expect(formatShowcaseCaption('Showcase skin by {player}.', player)).toBe(
      `Showcase skin by ${player.name}.`,
    );
  });
});
