import { z } from 'zod';

const microsoftOAuthCredentialsSchema = z.object({
  clientId: z.uuid(),
  clientSecret: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[^\r\n]+$/u)
    .optional(),
});

export interface MicrosoftOAuthCredentials {
  readonly clientId: string;
  readonly clientSecret?: string;
}

export function loadMicrosoftOAuthCredentials(
  source: NodeJS.ProcessEnv,
): MicrosoftOAuthCredentials {
  const rawClientSecret = source['MICROSOFT_OAUTH_CLIENT_SECRET'];
  const parsed = microsoftOAuthCredentialsSchema.parse({
    clientId: source['MICROSOFT_OAUTH_CLIENT_ID'],
    ...(rawClientSecret === undefined || rawClientSecret.length === 0
      ? {}
      : { clientSecret: rawClientSecret }),
  });
  return parsed.clientSecret === undefined
    ? { clientId: parsed.clientId }
    : { clientId: parsed.clientId, clientSecret: parsed.clientSecret };
}
