import { escapeHtml } from '../html.js';

// Covers the shapes the docs render: dotenv, HTTP snippets, form-encoded
// bodies, JSON. Strings match before URLs so quoted values stay one token;
// placeholders like {uuid} stay outside the URL charset so they still highlight.
const TOKEN_PATTERN = new RegExp(
  [
    '(?<comment>#[^\\n]*)',
    '(?<placeholder><[^>\\n]+>|\\{[^{}\\n]+\\})',
    '(?<key>"[^"\\n]+"(?=\\s*:)|\\b[A-Za-z_][A-Za-z0-9_-]*(?==)|^[A-Za-z][A-Za-z-]*(?=: ))',
    '(?<string>"[^"\\n]*"|\'[^\'\\n]*\')',
    '(?<url>https?://[^\\s"\'<{]+)',
    '(?<keyword>\\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|Bearer)\\b)',
    '(?<number>\\b\\d+(?:\\.\\d+)?\\b)',
  ].join('|'),
  'gm',
);

export function highlightCode(code: string): string {
  let html = '';
  let offset = 0;
  for (const match of code.matchAll(TOKEN_PATTERN)) {
    const [token] = match;
    html += escapeHtml(code.slice(offset, match.index));
    const kind = Object.keys(match.groups ?? {}).find((name) => match.groups?.[name] !== undefined);
    html += kind ? `<span class="tok-${kind}">${escapeHtml(token)}</span>` : escapeHtml(token);
    offset = match.index + token.length;
  }
  return html + escapeHtml(code.slice(offset));
}
