export interface DemoPlayer {
  readonly hasCape?: boolean;
  readonly name: string;
  readonly uuid: string;
}

// A fixed showcase identity keeps landing/docs responses cacheable.
export const DEMO_PLAYER: DemoPlayer = {
  hasCape: true,
  name: 'Dastcz',
  uuid: '4a11ca60-63b6-451f-82eb-50119d8e5052',
};

// Callers HTML-escape the caption together with the template text.
export function formatShowcaseCaption(template: string, player: DemoPlayer): string {
  return template.replaceAll('{player}', player.name);
}
