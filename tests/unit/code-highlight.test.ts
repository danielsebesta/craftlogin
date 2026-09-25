import { describe, expect, it } from 'vitest';

import { highlightCode } from '../../src/api/ui/code-highlight.js';
import { uiControlStyles } from '../../src/api/ui/controls.js';

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
