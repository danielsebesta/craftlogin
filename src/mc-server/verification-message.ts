import { english } from '../locales/en.js';
import type { VerificationResolution } from '../verification/verification-resolver.js';

// The confirmation code travels inside the encrypted disconnect: the app name
// warns the player which site the sign-in is for, and the code itself is a
// secret a relaying proxy cannot read or rewrite.
export function verificationSuccessMessage(
  resolution: Extract<VerificationResolution, { status: 'resolved' }>,
): string {
  if (resolution.confirmCode === undefined) {
    return english.minecraft.success;
  }
  return english.minecraft.successWithCode(
    sanitizeMinecraftLabel(resolution.appName),
    resolution.confirmCode,
  );
}

// Kick text renders § as a formatting escape, so client display names lose
// formatting codes (the escape plus its argument), control characters, and
// excess whitespace before use.
function sanitizeMinecraftLabel(label: string | undefined): string | undefined {
  if (label === undefined) {
    return undefined;
  }
  const cleaned = label
    .replaceAll(/§[0-9a-fk-orx]/giu, '')
    .replaceAll('§', '')
    .replaceAll(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
  if (cleaned.length === 0) {
    return undefined;
  }
  const graphemes = [...new Intl.Segmenter().segment(cleaned)].map((part) => part.segment);
  return graphemes.length > 48 ? `${graphemes.slice(0, 48).join('')}…` : cleaned;
}
