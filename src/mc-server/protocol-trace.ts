import type { PacketMeta, ServerClient, States } from 'minecraft-protocol';
import type { Logger } from 'pino';

import { getErrorKind } from '../logging/error-kind.js';

const REDACTED = '[REDACTED]';
const VERIFICATION_CODE_IN_TEXT =
  /(?<![A-Z2-9])[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}(?![A-Z2-9])/giu;
const URL_QUERY_VALUE = /([?&][^=\s&]+)=([^&\s]+)/gu;
const BEARER_VALUE = /\b(Bearer)\s+\S+/giu;

type ClientWrite = (packetName: string, params: unknown) => void;

export function installProtocolTrace(client: ServerClient, logger: Logger): void {
  const writePacket: ClientWrite = client.write.bind(client);

  client.write = (packetName: string, params: unknown): void => {
    logger.trace(
      { ...clientContext(client), direction: 'clientbound', packetName, state: client.state },
      'Minecraft protocol packet',
    );
    writePacket(packetName, params);
  };

  client.on('packet', (_packet: unknown, metadata: PacketMeta): void => {
    logger.trace(
      {
        ...clientContext(client),
        direction: 'serverbound',
        packetName: metadata.name,
        state: metadata.state,
      },
      'Minecraft protocol packet',
    );
  });
  client.on('state', (state: States, previousState: States): void => {
    logger.trace(
      { ...clientContext(client), previousState, state },
      'Minecraft protocol state changed',
    );
  });
  client.on('error', (error: Error): void => {
    logger.trace(
      { ...clientContext(client), ...getProtocolErrorDetails(error) },
      'Minecraft protocol client error',
    );
  });
  client.once('end', (): void => {
    logger.trace(clientContext(client), 'Minecraft protocol connection ended');
  });
}

export function getProtocolErrorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { errorKind: getErrorKind(error) };
  }

  const field = getStringProperty(error, 'field');
  return {
    errorKind: error.name,
    errorMessage: sanitizeDiagnosticText(error.message),
    ...(error.stack === undefined ? {} : { errorStack: sanitizeDiagnosticText(error.stack) }),
    ...(field === undefined ? {} : { protocolField: sanitizeDiagnosticText(field) }),
  };
}

function clientContext(client: ServerClient): Record<string, unknown> {
  return {
    clientId: client.id,
    minecraftVersion: client.version,
    protocolVersion: client.protocolVersion,
  };
}

function getStringProperty(value: object, property: string): string | undefined {
  const candidate: unknown = Reflect.get(value, property);
  return typeof candidate === 'string' ? candidate : undefined;
}

function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(VERIFICATION_CODE_IN_TEXT, REDACTED)
    .replace(URL_QUERY_VALUE, `$1=${REDACTED}`)
    .replace(BEARER_VALUE, `$1 ${REDACTED}`);
}
