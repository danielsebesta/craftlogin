import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { english } from '../../src/locales/en.js';

describe('public OIDC integration guidance', (): void => {
  it('ships one canonical guide and one simple landing-page prompt', async (): Promise<void> => {
    const canonical = await readFile(resolve(process.cwd(), 'docs/integrations/oidc.md'), 'utf8');

    expect(canonical).toContain('/.well-known/openid-configuration');
    expect(canonical).toContain('Authorization Code Flow');
    expect(canonical).toContain('PKCE S256');
    expect(canonical).toContain('`sub`');
    expect(canonical).toContain('Never key accounts');
    expect(canonical).toContain('Do not paste a client secret');

    const prompt = english.landing.aiPrompt.prompt;
    expect(prompt).toContain('https://craftlogin.com/llms-full.txt');
    expect(prompt).toContain('First inspect the existing framework');
    expect(prompt).toContain('Never ask me to paste a client secret');
    expect(prompt).toContain('Use a maintained OpenID Connect library');
    expect(prompt).toContain('stable account mapping by sub');
    expect(prompt).toContain('formatter, type checker, linter, and tests');
    expect(prompt).not.toContain('{{');
  });

  it('keeps both LLM entry points focused on relying-party integration', async (): Promise<void> => {
    const [concise, full] = await Promise.all([
      readFile(resolve(process.cwd(), 'llms.txt'), 'utf8'),
      readFile(resolve(process.cwd(), 'llms-full.txt'), 'utf8'),
    ]);

    expect(concise).toContain('Websites can add “Sign in with Minecraft”');
    expect(concise).toContain('https://craftlogin.com/#implement-with-ai');
    expect(full).toContain('not for contributors modifying CraftLogin itself');
    expect(full).toContain('## Review checklist');
    expect(full).not.toContain('## Implementation prompt');
    expect(full).not.toContain('/docs/integrations/ai');
    expect(full).not.toContain('CRAFTLOGIN_CLIENT_SECRET=replace');
  });
});
