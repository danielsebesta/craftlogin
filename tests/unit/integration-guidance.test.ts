import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const integrationFiles = [
  'docs/integrations/oidc.md',
  'docs/integrations/ai/README.md',
  'docs/integrations/ai/generic-oidc.md',
  'docs/integrations/ai/nextjs-authjs.md',
  'docs/integrations/ai/node-server.md',
  'docs/integrations/ai/python.md',
  'docs/integrations/ai/php.md',
  'docs/integrations/ai/spa.md',
  'docs/integrations/ai/review-existing-integration.md',
] as const;

describe('public OIDC integration guidance', (): void => {
  it('ships canonical and stack-specific guidance', async (): Promise<void> => {
    const contents = await Promise.all(
      integrationFiles.map(async (filename): Promise<string> => {
        return await readFile(resolve(process.cwd(), filename), 'utf8');
      }),
    );

    for (const content of contents) {
      expect(content.length).toBeGreaterThan(150);
    }

    const canonical = contents[0];
    expect(canonical).toContain('/.well-known/openid-configuration');
    expect(canonical).toContain('Authorization Code Flow');
    expect(canonical).toContain('PKCE S256');
    expect(canonical).toContain('`sub`');
    expect(canonical).toContain('Never key accounts');
    expect(canonical).toContain('Do not paste a client secret');

    const implementationPrompt = contents[2];
    expect(implementationPrompt).toContain('invalid/missing/replayed state');
    expect(implementationPrompt).toContain('Do not use localStorage');
    expect(implementationPrompt).toContain('Use the OIDC “sub” claim as the stable account key');

    const auditPrompt = contents.at(-1);
    expect(auditPrompt).toContain('do not edit anything yet');
    expect(auditPrompt).toContain('severity, file and line');
  });

  it('keeps both LLM entry points focused on relying-party integration', async (): Promise<void> => {
    const [concise, full] = await Promise.all([
      readFile(resolve(process.cwd(), 'llms.txt'), 'utf8'),
      readFile(resolve(process.cwd(), 'llms-full.txt'), 'utf8'),
    ]);

    expect(concise).toContain('Websites can add “Sign in with Minecraft”');
    expect(concise).toContain('https://craftlogin.com/docs/integrations/ai');
    expect(full).toContain('not for contributors modifying CraftLogin itself');
    expect(full).toContain('## Implementation prompt');
    expect(full).toContain('## Review checklist');
    expect(full).not.toContain('CRAFTLOGIN_CLIENT_SECRET=replace');
  });
});
