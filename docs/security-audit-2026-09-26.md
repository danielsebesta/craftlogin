# Security audit — 2026-09-26

Scope: whole CraftLogin repository — HTTP API, OIDC provider configuration, Minecraft ghost server,
developer console, persistence (PostgreSQL/Prisma, Redis), containers, CI, and legal surface.
Methodology: manual code review + a new adversarial test suite
(`tests/unit/security-pentest.test.ts`, 32 tests) exercising the live Fastify instance via
`server.inject`.

## Executive summary

The codebase has a strong security posture. PKCE S256 is mandatory for every client, `state` is
required, redirect URIs are exact matches, confidential secrets are Argon2id-hashed, refresh tokens
are stored only as hashes and rotate, every route carries JSON-Schema validation with a shared error
envelope, the verification state machine is atomic Lua, and security headers are applied to both
Fastify and raw OIDC replies.

One low-severity issue was found and **fixed** during the audit: production `308` canonical
redirects skipped Helmet headers because the canonical `onRequest` hook was registered before
`@fastify/helmet` and short-circuited the hook chain. Helmet is now registered first
(`src/api/server.ts`) and a regression test asserts headers on the redirect.

## Findings

| ID   | Severity | Status    | Detail                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | -------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F-01 | Low      | **Fixed** | `308` canonical redirects lacked `x-content-type-options`, HSTS, `referrer-policy`, `cross-origin-opener-policy` (hook ordering). Fixed in `src/api/server.ts`; covered by pentest `builds canonical redirect targets…`.                                                                                                                                                 |
| F-02 | Info     | **Fixed** | No self-service account deletion (GDPR Art. 17). Resolved by the `/account` page: a signed-in user can revoke individual connected services or erase the whole identity (refresh-token rows, Redis grants, OIDC session, and all provider cookies are cleaned up), which is stronger than the originally suggested bearer-token endpoint because it needs no API client. |
| F-03 | Info     | **Fixed** | `/api/users/:identifier` returns synthetic offline-mode UUIDs for unregistered names (documented design, clearly commented). The OpenAPI description now states explicitly that a synthetic profile is never a verified identity.                                                                                                                                        |
| F-04 | Info     | Open      | The OptiFine cape provider is fetched over cleartext HTTP — a documented, accepted risk in `AGENTS.md`/`SECURITY.md`. Keep it out of credential-bearing paths (currently true).                                                                                                                                                                                          |
| F-05 | Info     | **Fixed** | NIS2/GDPR incident-response timelines (early warning 24 h, notification 72 h, GDPR breach 72 h) are now written into `docs/security-runbook.md` together with an incident classification table and a restore-test cadence.                                                                                                                                               |

No high- or medium-severity issues were identified.

## Security headers — verified state

| Header                                | Status                                                                                                                                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content-security-policy`             | `default-src 'none'` baseline on OIDC replies; strict per-page policies (`script-src 'self'`, `form-action 'self'`/`'none'`); mirrored by `Content-Security-Policy-Report-Only` with `report-uri /api/csp-report` |
| `strict-transport-security`           | `max-age=31536000; includeSubDomains` (OIDC baseline) + Helmet on all Fastify replies                                                                                                                             |
| `x-frame-options` / `frame-ancestors` | `DENY` / `'none'` everywhere content is served                                                                                                                                                                    |
| `x-content-type-options`              | `nosniff` on all replies incl. downloads                                                                                                                                                                          |
| `referrer-policy`                     | `no-referrer`                                                                                                                                                                                                     |
| `cross-origin-opener-policy`          | `same-origin`                                                                                                                                                                                                     |
| `permissions-policy`                  | `camera=(), geolocation=(), microphone=(), payment=(), usb=()` via global `onSend` hook + OIDC baseline                                                                                                           |
| `cache-control`                       | `no-store` on interactions, status endpoints, errors, downloads; long immutable caching only for fingerprinted static assets                                                                                      |

## Penetration test coverage

`tests/unit/security-pentest.test.ts` maps to these attack classes:

- **Header coverage** on JSON, HTML, error, 404 and redirect responses.
- **Information disclosure**: malformed JSON, unknown routes, 2 MB bodies, wrong content types →
  generic envelope, no stack/`x-powered-by`/file paths.
- **AuthN/Z bypass**: missing/empty/wrong-scheme bearer (400/401 + `WWW-Authenticate`), developer
  API without session (401), CSRF missing/wrong/correct.
- **Injection**: traversal, NUL, CRLF, oversized and metacharacter interaction UIDs; hostile
  redirect-URI schemes (`javascript:`, `http` non-loopback, `ftp`, `localhost.evil`), extra
  properties, wrong types, >20 URIs; SQLi-shaped skin usernames; malformed Microsoft `state`
  (`oneOf` enforced); forged Microsoft callbacks without the signed transaction cookie.
- **XSS**: developer-controlled app name `"><script>alert(1)</script>` rendered escaped.
- **CORS**: unregistered origins get no `Access-Control-Allow-Origin`, no credentials flag; only the
  public profile endpoint serves `*` by design.
- **Method tampering**: PUT/DELETE/PATCH on read-only routes → 404 envelope.
- **Host header**: redirect targets are built only from the configured issuer, never from `Host`;
  foreign hosts are ignored rather than redirected.
- **Rate limiting**: `/oauth2/token` per-IP budget → 429 `rate_limited` + `retry-after` +
  `no-store`.
- **Cache discipline**: interaction page/status are `no-store`.
- **CSP report sink**: malformed bodies → 204; >16 KiB → 413.
- **Docs gating**: Swagger UI unreachable in production.
- **Cookies**: `__Secure-`/`__Host-` prefixes, `HttpOnly; Secure; SameSite=Lax`, signed, path-scoped
  — verified end-to-end on `/developers/login`.
- **Credential hygiene**: Argon2id hash format, malformed-hash rejection, timing-safe CSRF compare
  (no length oracle), unambiguous verification-code alphabet.

Previously existing coverage (kept, not duplicated): PKCE S256 + `state` enforced end-to-end
(`oauth-provider-flow.test.ts`), DPoP + PAR one-time use, Lua state-machine atomicity (integration),
lobby/ghost-server bounds, log redaction, auto-forward URL hardening, Microsoft token hygiene
(request-memory only), session sliding/absolute TTL.

## GDPR review (Regulation 2016/679)

Data inventory confirmed against `prisma/schema.prisma` and the privacy page:

| Data                                                          | Lawful note                         |
| ------------------------------------------------------------- | ----------------------------------- |
| Minecraft UUID (PK) + current username                        | Identity itself — minimum viable    |
| `firstVerifiedAt`, `lastVerifiedAt`                           | Service operation                   |
| Developer UUID, role, owned apps                              | Access control                      |
| Refresh-token **hashes** + client/user/expiry                 | Session continuity                  |
| Redis: verification records (~5 min), session IP + user-agent | Security anomaly signals, disclosed |

GDPR checklist:

- **Art. 5 minimization** — pass. No email, password, or PII beyond the Minecraft identity.
  `/api/users/@me` and the public profile return exactly `{uuid, username}` (tested).
- **Art. 12–14 transparency** — pass. `/privacy` discloses controller (Daniel Šebesta,
  `contact@craftlogin.com`), stored/never-stored data, cookies, logs, retention, rights.
- **Art. 15 access** — partial. `@me` returns own data; other rights via email. Acceptable.
- **Art. 17 erasure** — partial (F-02). Email-based erasure works; self-service deletion would be
  stronger.
- **Art. 20 portability** — trivial dataset (UUID + name); email fulfilment is proportionate.
- **Art. 25 data protection by design** — pass. Argon2id secrets, hashed refresh tokens, ephemeral
  Redis, no analytics/trackers (cookies are strictly necessary → no banner required).
- **Art. 32 security of processing** — pass. TLS edge, signed httpOnly cookies, rate limiting,
  least-privilege containers (`cap_drop: ALL`, read-only FS, non-root).
- **Art. 33 breach notification** — organizational. Recommend adding the 72-hour timeline to the
  runbook (F-05).
- **Art. 30 records of processing** — organizational, keep outside the repo.
- **Transfers (Ch. V)** — note: Mojang/Microsoft lookups and the Microsoft OAuth flow send identity
  data to US processors; consider noting the transfer basis in the privacy policy.
- **DPO** — not required at this scale; contact address already serves as the point of contact.

## NIS2 review (Directive 2022/2555)

CraftLogin as an OAuth/OIDC IdP maps to NIS2 Art. 21 measures where applicable to the operator:

- **Risk analysis & ISMS policies** — `SECURITY.md`, `AGENTS.md` security invariants,
  `docs/security-runbook.md` (rotation, signals, recovery). Gap (F-05): write incident
  classification and the 24 h/72 h reporting deadlines into the runbook.
- **Incident handling** — structured pino logs with redaction, anomaly session signals
  (`developer_session_signal_changed`), CSP violation telemetry, rate-limit spikes. Alerting
  destinations are operational, not code — document them.
- **Business continuity** — Postgres is the only durable store; `pg_dump`/WAL-G guidance and restore
  testing exist in the runbook; recommend a tested-restore cadence.
- **Supply chain security** — `npm audit --audit-level=high`, Gitleaks, CycloneDX SBOM, Trivy image
  scans, `npm ci --ignore-scripts`, patched transitive overrides. Strong.
- **Acquisition/dev/maintenance** — strict TypeScript, schema-first validation, mandatory reviews
  via CI (`npm run check`).
- **Cryptography** — Argon2id (64 MiB/3/1), S256 PKCE only, RSA/EC JWKS, HMAC session binding,
  timing-safe compares. Strong.
- **MFA / secure authentication** — identity anchored to Mojang/Microsoft online-mode auth;
  developer console goes through the standard OIDC flow with PKCE, no parallel login.
- **Cyber hygiene / training** — organizational, outside repository scope.

## Recommendations (priority order)

1. Add NIS2/GDPR incident timelines (24 h early warning, 72 h notification) and restore-test cadence
   to `docs/security-runbook.md`.
2. Consider `DELETE /api/users/@me` for self-service erasure (F-02).
3. State the non-verified nature of synthetic offline UUIDs in the OpenAPI description of
   `/api/users/:identifier` (F-03).
4. Note the Mojang/Microsoft international-transfer basis in the privacy policy.
5. Re-run this pentest suite in CI (`npm test` already includes `tests/unit`).

## Verification performed

- `npx vitest run tests/unit/security-pentest.test.ts` — 32/32 pass.
- `npm test` (all unit tests) — 431/431 pass, no regressions.
- `eslint`, `tsc --noEmit`, `prettier --check` — clean on touched files.
