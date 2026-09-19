export interface DemoPlayer {
  readonly name: string;
  readonly uuid: string;
}

// Curated PaperBoat SMP members with modern 64x64 skins and visible second
// layers (helmet, jacket, sleeves, or leggings), verified against live Mojang
// skins. The showcase rotates deterministically by day so every visitor on a
// given day sees the same player and responses stay cacheable.
export const DEMO_PLAYERS: readonly DemoPlayer[] = [
  { name: 'TUHRY', uuid: '4b362f3d-48d9-41a2-b19d-7e41cfc08a05' },
  { name: 'Eli', uuid: 'd618e60f-3113-4de0-94ef-28992322993c' },
  { name: 'Emity', uuid: '6edd1045-1a62-46c0-8ea5-526c679a5df7' },
  { name: 'Gingermold', uuid: 'fcd48526-f129-4355-b441-990035bb3cc9' },
  { name: 'Ice', uuid: 'f360304f-fe91-4ed6-b6b5-ae8a9d3609ac' },
  { name: 'solo', uuid: 'cfe6256f-66c8-4ebf-8a7b-7796999e91f0' },
];

const FIRST_PLAYER: DemoPlayer = { name: 'TUHRY', uuid: '4b362f3d-48d9-41a2-b19d-7e41cfc08a05' };

export function selectDemoPlayer(now: Date = new Date()): DemoPlayer {
  if (DEMO_PLAYERS.length === 0) {
    return FIRST_PLAYER;
  }
  const day = Math.floor(now.getTime() / 86_400_000);
  const index = ((day % DEMO_PLAYERS.length) + DEMO_PLAYERS.length) % DEMO_PLAYERS.length;
  return DEMO_PLAYERS[index] ?? FIRST_PLAYER;
}

// Player names are safe Mojang identifiers, but the composed caption is still
// HTML-escaped by callers together with the surrounding template text.
export function formatShowcaseCaption(template: string, player: DemoPlayer): string {
  return template.replaceAll('{player}', player.name);
}
