const APPLICATION_ID = '7f143b3d-bf80-4896-86ee-bd902f90ca63';
const LOGO_PATH =
  'M70 0v20.002h60V0Zm60 20.002v40H70v-40H50v40H30v20h140v-20h-20v-40zm40 60V180h19.999V80.002ZM170 180H30v20h140Zm-140 0V80.002H10.002V180Zm22.814-24.807H42.737v-50.385h10.077V94.73h40.309v10.078H103.2v10.077H83.046v-10.077H62.89v50.385h20.155v-10.077H103.2v10.077H93.123v10.077H52.814Zm57.235 10.077V94.73h16.09v55.343h31.124v15.197z';
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><style>path{fill:#191d1a}@media(prefers-color-scheme:dark){path{fill:#edf1ed}}</style><path d="${LOGO_PATH}"/></svg>`;

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
        <svg aria-hidden="true" viewBox="0 0 200 200" width="200" height="200">
          <path fill="currentColor" d="${LOGO_PATH}"></path>
        </svg>
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
