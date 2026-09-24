import { describe, expect, it } from 'vitest';

import { legalStyles } from '../../src/api/legal-assets.js';
import { renderLegalPage, type LegalPageKind } from '../../src/api/legal-page.js';
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
