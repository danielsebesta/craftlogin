import Bowser from 'bowser';

import { english } from '../../locales/en.js';

/**
 * Short human-readable device line for session cards. The raw agent string
 * stays on the card's `title` attribute for audit; this label is display-only.
 */
export function describeUserAgent(userAgent: string): string {
  // Bowser.parse throws on an empty string and reports unrecognized agents
  // (bots, curl, arbitrary noise) as an empty browser name; both fall back.
  if (userAgent.trim().length === 0) {
    return english.developer.sessions.unknownAgent;
  }
  const parsed = Bowser.parse(userAgent);
  const browserName = parsed.browser.name ?? '';
  if (browserName.length === 0) {
    return english.developer.sessions.unknownAgent;
  }
  const majorVersion = parsed.browser.version?.split('.')[0] ?? '';
  const browser = majorVersion.length === 0 ? browserName : `${browserName} ${majorVersion}`;
  const osName = parsed.os.name ?? '';
  if (osName.length === 0) {
    return browser;
  }
  const osVersion = parsed.os.versionName ?? parsed.os.version ?? '';
  const os = osVersion.length === 0 ? osName : `${osName} ${osVersion}`;
  return `${browser} · ${os}`;
}
