export function permitsAuthenticationContext(
  requested: string | undefined,
  context: string,
): boolean {
  return requested === undefined || requested.split(/\s+/u).includes(context);
}
