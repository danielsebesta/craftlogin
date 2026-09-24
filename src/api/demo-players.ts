export interface DemoPlayer {
  readonly hasCape?: boolean;
  readonly name: string;
  readonly uuid: string;
}

// The showcase player appears on the landing page and in the docs avatar
// section; a fixed identity keeps responses cacheable.
export const DEMO_PLAYER: DemoPlayer = {
  hasCape: true,
  name: 'Dastcz',
  uuid: '4a11ca60-63b6-451f-82eb-50119d8e5052',
};

// The composed caption is HTML-escaped by callers together with the
// surrounding template text.
export function formatShowcaseCaption(template: string, player: DemoPlayer): string {
  return template.replaceAll('{player}', player.name);
}
