const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const COMPACT_UUID_PATTERN = /^[0-9a-fA-F]{32}$/u;

export function canonicalMinecraftUuid(value: string): string | undefined {
  const trimmed = value.trim();
  if (CANONICAL_UUID_PATTERN.test(trimmed)) {
    return trimmed;
  }
  if (!COMPACT_UUID_PATTERN.test(trimmed)) {
    return undefined;
  }
  const lower = trimmed.toLowerCase();
  return `${lower.slice(0, 8)}-${lower.slice(8, 12)}-${lower.slice(12, 16)}-${lower.slice(16, 20)}-${lower.slice(20)}`;
}

export function stripMinecraftUuidDashes(uuid: string): string {
  return uuid.replaceAll('-', '');
}
