import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEMO_PLAYER, formatShowcaseCaption } from '../../src/api/demo-players.js';
import { legalStyles } from '../../src/api/legal-assets.js';
import { renderLegalPage, type LegalPageKind } from '../../src/api/legal-page.js';
import { highlightCode } from '../../src/api/ui/code-highlight.js';
import { uiControlStyles } from '../../src/api/ui/controls.js';
import { english } from '../../src/locales/en.js';

const KINDS: readonly LegalPageKind[] = ['privacy', 'terms'];

describe('legal pages', (): void => {
  it('renders the privacy policy with its data commitments', (): void => {
    const html = renderLegalPage('privacy');

    expect(html).toContain('<h1>Privacy policy</h1>');
    expect(html).toContain(english.legal.lastUpdated);
    expect(html).toContain('contact@craftlogin.com');
    expect(html).toContain('/assets/legal.css');
    // The claims a reader must be able to find without JavaScript.
    expect(html).toContain('Minecraft UUID');
    expect(html).toContain('one-way hashes');
    expect(html).toContain('Microsoft access or refresh tokens');
    expect(html).toContain('no analytics');
  });

  it('renders the terms with the acceptable use rules', (): void => {
    const html = renderLegalPage('terms');

    expect(html).toContain('<h1>Terms of service</h1>');
    expect(html).toContain('Impersonate Mojang or Microsoft');
    expect(html).toContain('Keep confidential client secrets on your server');
    expect(html).toContain('Minecraft EULA');
    expect(html).toContain('MIT License');
  });

  it('keeps heading levels ordered and section labels unique', (): void => {
    for (const kind of KINDS) {
      const html = renderLegalPage(kind);
      const strings = english.legal[kind];

      expect(html).toContain('<h1>');
      expect(html.indexOf('<h1>')).toBeLessThan(html.indexOf('<h2'));
      const ids = [...html.matchAll(new RegExp(`id="${kind}-section-(\\d+)"`, 'gu'))].map(
        (match): string => match[0],
      );
      expect(ids).toHaveLength(strings.sections.length);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        expect(html).toContain(`aria-labelledby="${id.slice(4, -1)}"`);
      }
    }
  });

  it('links both legal pages from the shared footer and loads no scripts', (): void => {
    for (const kind of KINDS) {
      const html = renderLegalPage(kind);

      expect(html).toContain('class="footer-links"');
      expect(html).toContain('href="/privacy"');
      expect(html).toContain('href="/terms"');
      expect(html).not.toContain('<script');
      expect(html).toContain('lang="en"');
      expect(html).toContain('skip-link');
    }
  });

  it('keeps the legal stylesheet on the shared tokens', (): void => {
    expect(legalStyles).toContain('font-family: "Pixeloid Sans"');
    expect(legalStyles).toContain(':focus-visible');
    expect(legalStyles).toContain('.legal-page');
    expect(legalStyles).toContain('.footer-links');
    expect(legalStyles).not.toContain('box-shadow');
    expect(legalStyles).not.toMatch(/https?:\/\//u);
  });
});

describe('demo player showcase', (): void => {
  it('uses a fixed canonical identity and formats the caption with the player name', (): void => {
    expect(DEMO_PLAYER.name).toBe('Dastcz');
    expect(DEMO_PLAYER.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    );
    expect(DEMO_PLAYER.hasCape).toBe(true);
    expect(formatShowcaseCaption('Showcase skin by {player}.', DEMO_PLAYER)).toBe(
      'Showcase skin by Dastcz.',
    );
  });
});

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

    expect(concise).toContain('Websites can add "Sign in with Minecraft"');
    expect(concise).toContain('https://craftlogin.com/#implement-with-ai');
    expect(full).toContain('not for contributors modifying CraftLogin itself');
    expect(full).toContain('## Review checklist');
    expect(full).not.toContain('## Implementation prompt');
    expect(full).not.toContain('/docs/integrations/ai');
    expect(full).not.toContain('CRAFTLOGIN_CLIENT_SECRET=replace');
  });
});

describe('highlightCode', () => {
  it('marks dotenv keys and URLs', () => {
    const html = highlightCode('CRAFTLOGIN_ISSUER=https://craftlogin.com');
    expect(html).toContain('<span class="tok-key">CRAFTLOGIN_ISSUER</span>=');
    expect(html).toContain('<span class="tok-url">https://craftlogin.com</span>');
  });

  it('distinguishes JSON keys from string values', () => {
    const html = highlightCode('{\n  "sub": "4a11ca60",\n  "picture": "https://x/y"\n}');
    expect(html).toContain('<span class="tok-key">&quot;sub&quot;</span>:');
    expect(html).toContain('<span class="tok-string">&quot;4a11ca60&quot;</span>');
    expect(html).toContain('<span class="tok-string">&quot;https://x/y&quot;</span>');
  });

  it('marks HTTP methods, headers, and form keys', () => {
    const html = highlightCode(
      'POST /oauth2/token\nContent-Type: application/x-www-form-urlencoded\n\ngrant_type=authorization_code',
    );
    expect(html).toContain('<span class="tok-keyword">POST</span>');
    expect(html).toContain('<span class="tok-key">Content-Type</span>: ');
    expect(html).toContain('<span class="tok-key">grant_type</span>=');
  });

  it('marks angle and brace placeholders, including inside URLs', () => {
    const html = highlightCode('&state=<random-value>\nhttps://x/avatar/{uuid}');
    expect(html).toContain('<span class="tok-placeholder">&lt;random-value&gt;</span>');
    expect(html).toContain('<span class="tok-url">https://x/avatar/</span>');
    expect(html).toContain('<span class="tok-placeholder">{uuid}</span>');
  });

  it('escapes every token and gap so code cannot inject markup', () => {
    const html = highlightCode('<img src=x>\n"a&b" = c');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('"a&b"');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).toContain('&quot;a&amp;b&quot;');
  });

  it('leaves prose untouched except URLs and comments', () => {
    const html = highlightCode('Read https://craftlogin.com/llms-full.txt first.');
    expect(html).toContain('<span class="tok-url">https://craftlogin.com/llms-full.txt</span>');
    expect(html).toContain(' first.');
  });
});

describe('code-block token styles', () => {
  it('styles every token class on the shared code block', () => {
    for (const kind of ['key', 'string', 'url', 'keyword', 'number', 'placeholder', 'comment']) {
      expect(uiControlStyles).toContain(`.tok-${kind}`);
    }
  });
});
