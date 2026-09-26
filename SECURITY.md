# Security Policy

## Reporting a Vulnerability

Report vulnerabilities through GitHub private security advisories:

<https://github.com/danielsebesta/craftlogin/security/advisories/new>

Do not open public issues for security reports. Include a description of the impact, reproduction
steps, and affected endpoints or flows where possible. A `security.txt` file with the same contact
is served at `/.well-known/security.txt`.

## Scope

CraftLogin is an OAuth 2.0 / OpenID Connect provider for Minecraft identities. Reports of interest
include, but are not limited to:

- Authorization, token, redirect-URI, or PKCE handling flaws.
- Session fixation, CSRF, or cookie-scope weaknesses in interactions or the Developer Console.
- Verification-record race conditions (code reuse, double claim, replay).
- Injection, escaping, or header handling flaws.
- Denial of service reachable without authentication (memory, CPU, connection).

Known accepted risks are documented in `AGENTS.md` and are out of scope: the OptiFine cape provider
is fetched over cleartext HTTP because OptiFine does not offer TLS, and bearer tokens are
intentionally used (DPoP is opt-in).
