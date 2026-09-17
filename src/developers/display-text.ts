/**
 * Display text is stored and later rendered in a page, a terminal, or a log line.
 * Rejecting control characters keeps a stored value from breaking those outputs,
 * and rejecting outer whitespace keeps exact comparisons predictable.
 */
export function containsOnlyDisplayCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      return false;
    }
  }
  return true;
}
