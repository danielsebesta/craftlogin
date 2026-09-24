const APPLICATION_ID = '7f143b3d-bf80-4896-86ee-bd902f90ca63';
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,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"/>
</svg>`;

const securityHeaders = {
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="theme-color" content="#191d1a">
  <meta name="description" content="CraftLogin is an independent, open-source OpenID Connect provider for Minecraft: Java Edition accounts.">
  <title>CraftLogin: Coming soon</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <style>
    :root {
      color-scheme: dark;
      --bg: #191d1a;
      --surface: #202621;
      --raised: #29312b;
      --line: #475149;
      --text: #edf1ed;
      --muted: #b5beb6;
      --accent: #a2d060;
      --focus: #d0f19b;
      --control: #e4e9e4;
      --control-ink: #1b201c;
      --s1: .25rem;
      --s2: .5rem;
      --s3: .75rem;
      --s4: 1rem;
      --s5: 1.5rem;
      --s6: 2rem;
      --s7: 3rem;
      --s8: 4rem;
      --measure: 68ch;
    }

    * { box-sizing: border-box; }

    html {
      min-width: 320px;
      background: var(--bg);
      -webkit-text-size-adjust: 100%;
    }

    body {
      min-height: 100vh;
      margin: 0;
      color: var(--text);
      background: var(--bg);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 1rem;
      line-height: 1.65;
    }

    ::selection {
      color: var(--bg);
      background: var(--accent);
    }

    h1, h2, p, ul { margin: 0; }

    h1, h2 {
      line-height: 1.25;
      letter-spacing: -.01em;
      text-wrap: balance;
    }

    h1 {
      max-width: 18ch;
      font-size: 2.1rem;
    }

    h2 { font-size: 1.2rem; }

    p, li { text-wrap: pretty; }

    a {
      color: var(--text);
      text-decoration-thickness: .08em;
      text-underline-offset: .18em;
    }

    a:hover { color: var(--accent); }

    :focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
    }

    .skip-link {
      position: absolute;
      top: var(--s3);
      left: var(--s3);
      z-index: 10;
      padding: var(--s2) var(--s3);
      color: var(--control-ink);
      text-decoration: none;
      background: var(--control);
      border: 2px solid var(--control);
      transform: translateY(-200%);
    }

    .skip-link:focus { transform: translateY(0); }

    .shell {
      width: min(56rem, calc(100% - 2rem));
      margin-inline: auto;
    }

    header { border-bottom: 1px solid var(--line); }

    .header-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 4rem;
      gap: var(--s4);
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: var(--s2);
      min-height: 2.75rem;
      color: var(--text);
      font-weight: 700;
      text-decoration: none;
    }

    .brand svg { width: 1.25rem; height: 1.25rem; }

    .status {
      display: inline-flex;
      align-items: center;
      gap: var(--s2);
      color: var(--muted);
      font-size: .875rem;
    }

    .status::before {
      width: .6rem;
      height: .6rem;
      content: "";
      background: var(--accent);
      transform: rotate(45deg);
    }

    main { padding-block: var(--s8); }

    .hero {
      display: grid;
      gap: var(--s5);
      padding-bottom: var(--s8);
      border-bottom: 1px solid var(--line);
    }

    .lead {
      max-width: 52ch;
      color: var(--muted);
      font-size: 1.2rem;
    }

    .disclaimer {
      max-width: var(--measure);
      padding: var(--s4);
      color: var(--text);
      background: var(--surface);
      border-left: 4px solid var(--accent);
      font-size: .875rem;
      font-weight: 700;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--s3);
    }

    .button {
      display: inline-flex;
      min-height: 2.75rem;
      align-items: center;
      padding: var(--s2) var(--s4);
      color: var(--control-ink);
      background: var(--control);
      border: 2px solid var(--control);
      font-weight: 700;
      text-decoration: none;
    }

    .button:hover {
      color: var(--control-ink);
      background: #fff;
      border-color: #fff;
    }

    .button-secondary {
      color: var(--text);
      background: transparent;
      border-color: var(--line);
    }

    .button-secondary:hover {
      color: var(--text);
      background: var(--raised);
      border-color: var(--muted);
    }

    .section {
      display: grid;
      grid-template-columns: minmax(10rem, 14rem) minmax(0, 1fr);
      gap: var(--s5) var(--s7);
      padding-block: var(--s7);
      border-bottom: 1px solid var(--line);
    }

    .prose {
      display: grid;
      gap: var(--s4);
      max-width: var(--measure);
      color: var(--muted);
    }

    .prose strong { color: var(--text); }

    .prose ul {
      display: grid;
      gap: var(--s2);
      padding-left: var(--s5);
    }

    .meta {
      display: grid;
      gap: var(--s2);
      padding: var(--s4);
      color: var(--muted);
      background: var(--surface);
      border: 1px solid var(--line);
      font-size: .875rem;
    }

    footer {
      padding-block: var(--s6);
      color: var(--muted);
      border-top: 1px solid var(--line);
      font-size: .8125rem;
    }

    .footer-inner { display: grid; gap: var(--s3); }

    .legal {
      max-width: var(--measure);
      color: var(--text);
      font-weight: 700;
    }

    @media (max-width: 42rem) {
      main { padding-block: var(--s7); }
      .section { grid-template-columns: 1fr; gap: var(--s3); }
      .header-inner { align-items: flex-start; flex-direction: column; padding-block: var(--s2); }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; }
    }

    @media (forced-colors: active) {
      :focus-visible { outline-color: Highlight; }
      .status::before { forced-color-adjust: none; }
    }
  </style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>

  <header>
    <div class="shell header-inner">
      <a class="brand" href="/" aria-label="CraftLogin home">
        ${logoSvg}
        <span>CraftLogin</span>
      </a>
      <span class="status">Coming soon</span>
    </div>
  </header>

  <main id="main" class="shell">
    <section class="hero" aria-labelledby="page-title">
      <h1 id="page-title">Account verification for Java Edition</h1>
      <p class="lead">CraftLogin is an independent, open-source OAuth 2.0 and OpenID Connect provider for Minecraft: Java Edition accounts. It returns only the verified UUID and current username.</p>
      <p class="disclaimer">NOT AN OFFICIAL MINECRAFT SERVICE. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.</p>
      <div class="actions">
        <a class="button" href="https://github.com/danielsebesta/craftlogin">View source code</a>
        <a class="button button-secondary" href="mailto:contact@craftlogin.com">Contact the operator</a>
      </div>
    </section>

    <section class="section" aria-labelledby="verification-heading">
      <h2 id="verification-heading">How verification works</h2>
      <div class="prose">
        <p>A player proves control of an account by joining a short-lived online-mode server, publishing a short-lived signed skin marker, or completing one-shot Microsoft authentication.</p>
        <p>CraftLogin does not redistribute the game, modify the game client, bypass authentication, or bypass ownership and licensing checks.</p>
      </div>
    </section>

    <section class="section" aria-labelledby="microsoft-heading">
      <h2 id="microsoft-heading">Microsoft API access</h2>
      <div class="prose">
        <p>The optional Microsoft method requests only <strong>XboxLive.signin</strong> from the personal-accounts endpoint with S256 PKCE. It uses Xbox Live, XSTS, and Minecraft Services to confirm a qualifying Java Edition entitlement and retrieve the corresponding profile.</p>
        <p>It does not request offline access, Microsoft Graph, email, or Microsoft profile scopes. Microsoft, Xbox Live, XSTS, and Minecraft access tokens remain in request memory and are discarded when verification finishes.</p>
      </div>
    </section>

    <section class="section" id="privacy" aria-labelledby="privacy-heading">
      <h2 id="privacy-heading">Privacy</h2>
      <div class="prose">
        <p>This coming-soon page sets no cookies, runs no analytics, and collects no form submissions. Cloudflare may process connection and security data as the hosting provider.</p>
        <p>When the service launches, durable identity data will be limited to the canonical Java Edition UUID, current username, and first and last verification times. CraftLogin will not store Microsoft passwords, email addresses, Microsoft account identifiers, or provider access tokens.</p>
        <p>Short-lived verification and authorization state expires automatically. To ask about stored data or request deletion where applicable, email <a href="mailto:contact@craftlogin.com">contact@craftlogin.com</a>.</p>
      </div>
    </section>

    <section class="section" id="acceptable-use" aria-labelledby="use-heading">
      <h2 id="use-heading">Acceptable use</h2>
      <div class="prose">
        <p>CraftLogin may not be used to impersonate or imply approval by Mojang or Microsoft, bypass authentication or license checks, phish users, distribute malware, facilitate gambling, or support unlawful, deceptive, harmful, or abusive services.</p>
        <p>Integrators remain responsible for their applications, user disclosures, data protection obligations, and compliance with the Minecraft EULA and Usage Guidelines.</p>
        <p><a href="https://www.minecraft.net/usage-guidelines">Read the Minecraft Usage Guidelines</a>.</p>
      </div>
    </section>

    <section class="section" aria-labelledby="operator-heading">
      <h2 id="operator-heading">Operator</h2>
      <div class="prose">
        <div class="meta">
          <strong>CraftLogin is independently developed and operated by Daniel Šebesta.</strong>
          <span>Contact: <a href="mailto:contact@craftlogin.com">contact@craftlogin.com</a></span>
          <span>Source: <a href="https://github.com/danielsebesta/craftlogin">github.com/danielsebesta/craftlogin</a></span>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="shell footer-inner">
      <p class="legal">NOT AN OFFICIAL MINECRAFT SERVICE. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.</p>
      <p>CraftLogin is independently operated. Minecraft is a trademark of Microsoft Corporation.</p>
    </div>
  </footer>
</body>
</html>`;

export default {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Cloudflare infers the standalone JavaScript fetch handler's Response type.
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD', ...securityHeaders },
      });
    }

    if (url.pathname === '/.well-known/microsoft-identity-association.json') {
      const body = JSON.stringify({
        associatedApplications: [{ applicationId: APPLICATION_ID }],
      });
      return new Response(request.method === 'HEAD' ? null : body, {
        headers: {
          ...securityHeaders,
          'Cache-Control': 'public, max-age=3600',
          'Content-Type': 'application/json; charset=utf-8',
        },
      });
    }

    if (url.pathname === '/favicon.svg') {
      return new Response(request.method === 'HEAD' ? null : logoSvg, {
        headers: {
          ...securityHeaders,
          'Cache-Control': 'public, max-age=86400',
          'Content-Type': 'image/svg+xml; charset=utf-8',
        },
      });
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(request.method === 'HEAD' ? null : page, {
        headers: {
          ...securityHeaders,
          'Cache-Control': 'public, max-age=300',
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }

    return new Response('Not found', {
      status: 404,
      headers: {
        ...securityHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  },
};
