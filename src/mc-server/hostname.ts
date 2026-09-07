import { verificationCodeSchema } from '../verification/types.js';

function withoutOptionalPort(serverHost: string): string | null {
  const separatorIndex = serverHost.lastIndexOf(':');

  if (separatorIndex === -1) {
    return serverHost;
  }
  if (serverHost.indexOf(':') !== separatorIndex) {
    return null;
  }

  const portText = serverHost.slice(separatorIndex + 1);
  if (!/^[1-9]\d{0,4}$/u.test(portText)) {
    return null;
  }

  const port = Number.parseInt(portText, 10);
  if (port > 65_535) {
    return null;
  }

  return serverHost.slice(0, separatorIndex);
}

export function extractVerificationCode(serverHost: string, baseDomain: string): string | null {
  const metadataSeparatorIndex = serverHost.indexOf('\0');
  // Forge/FML appends forwarding metadata after a NUL delimiter. Only the first segment is the
  // hostname supplied by the player and is therefore eligible to select a verification code.
  const hostnameSegment =
    metadataSeparatorIndex === -1 ? serverHost : serverHost.slice(0, metadataSeparatorIndex);

  if (hostnameSegment.length === 0 || hostnameSegment.length > 260) {
    return null;
  }
  if (/[^\x21-\x7e]/u.test(hostnameSegment)) {
    return null;
  }

  const hostWithoutPort = withoutOptionalPort(hostnameSegment);
  if (hostWithoutPort === null) {
    return null;
  }

  const hostname = hostWithoutPort.endsWith('.')
    ? hostWithoutPort.slice(0, hostWithoutPort.length - 1)
    : hostWithoutPort;
  if (hostname.length > 253) {
    return null;
  }
  const labels = hostname.split('.');
  const baseLabels = baseDomain.split('.');

  if (labels.length !== baseLabels.length + 1) {
    return null;
  }

  const candidateBaseLabels = labels.slice(1);
  const hasExpectedBaseDomain = candidateBaseLabels.every(
    (label, index): boolean => label.toLowerCase() === baseLabels[index],
  );
  if (!hasExpectedBaseDomain) {
    return null;
  }

  const code = labels[0]?.toUpperCase();
  const parsedCode = verificationCodeSchema.safeParse(code);

  return parsedCode.success ? parsedCode.data : null;
}
