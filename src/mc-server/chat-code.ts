import { verificationCodeSchema } from '../verification/types.js';
import { extractVerificationCode } from './hostname.js';

// The lobby accepts a verification code through chat in any of these forms:
// a bare code ("K7MPQ4RX"), the full subdomain ("K7MPQ4RX.craftlogin.com"),
// or a verify command ("/verify K7MPQ4RX"). Pre-1.19 clients deliver commands
// as chat text with the slash kept; 1.19+ clients deliver them through the
// chat_command packet with the slash already stripped, so both are accepted.
const VERIFY_COMMAND_PATTERN = /^verify\s+(\S+)\s*$/iu;
const MAX_CHAT_TEXT_LENGTH = 260;

export function extractChatCode(message: string, baseDomain: string): string | null {
  const trimmed = message.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_CHAT_TEXT_LENGTH) {
    return null;
  }

  const withoutSlash = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  const commandMatch = VERIFY_COMMAND_PATTERN.exec(withoutSlash);
  const candidate = commandMatch?.[1] ?? trimmed;

  // A pasted subdomain goes through the same normalization and validation as the handshake
  // hostname, so both entry paths accept exactly the same inputs.
  const fromHost = extractVerificationCode(candidate, baseDomain);
  if (fromHost !== null) {
    return fromHost;
  }
  // The schema is uppercase-only while players may type lowercase; the handshake path applies
  // the same uppercase normalization.
  const fromCode = verificationCodeSchema.safeParse(candidate.toUpperCase());
  return fromCode.success ? fromCode.data : null;
}
