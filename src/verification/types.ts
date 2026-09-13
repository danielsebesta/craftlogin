import { z } from 'zod';

export const verificationCodeSchema = z
  .string()
  .length(8)
  .regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/u);

export const interactionIdSchema = z.string().min(1).max(512);

export const authenticatedMinecraftPlayerSchema = z.object({
  uuid: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u),
  username: z
    .string()
    .min(3)
    .max(16)
    .regex(/^[A-Za-z0-9_]+$/u),
});

export type AuthenticatedMinecraftPlayer = z.infer<typeof authenticatedMinecraftPlayerSchema>;

export const verificationMethodSchema = z.enum([
  'minecraft_online_mode',
  'minecraft_profile_skin',
  'microsoft_oauth',
]);
export type VerificationMethod = z.infer<typeof verificationMethodSchema>;

export type InteractionVerifiedIdentity = AuthenticatedMinecraftPlayer & {
  readonly verifiedVia: 'microsoft-oauth' | 'skin-pattern';
};

export type VerificationStatus =
  | { status: 'expired' }
  | { status: 'pending'; code: string | null }
  | {
      status: 'verified';
      player: AuthenticatedMinecraftPlayer;
      resolvedAt: string;
    };
