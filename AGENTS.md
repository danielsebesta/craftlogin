# CraftLogin Contributor Guide

## Purpose

CraftLogin is an MIT-licensed OAuth 2.0 and OpenID Connect provider for Minecraft Java Edition
identities. A user proves account ownership by joining a short-lived subdomain on an online-mode
Minecraft ghost server. The resulting UUID and username become the user's OIDC identity. CraftLogin
stores no email address or password.

This file is authoritative for agents and contributors working in this repository. Preserve the
security properties below even when a change appears simpler without them.

## Delivery process

Build and review the system in these stages. Complete and validate one stage before proceeding to
the next when work is being performed incrementally:

1. Project scaffold and persistence schema.
2. Minecraft ghost server and Redis-backed verification.
3. `oidc-provider` configuration, interactions, and adapters.
4. Fastify API, interaction UI, OpenAPI generation, and development Swagger UI.
5. Security hardening and concurrency review.
6. Production containers, environment reference, and documentation.

Do not leave placeholder TODOs, commented-out code, dead code, or partially implemented branches at
the end of a stage.

## Architecture

Keep modules small and organized by responsibility:

- `src/mc-server/` owns Minecraft protocol handling, hostname code extraction, online-mode login,
  success/error disconnect messages, and the Redis transition that resolves a verification.
- `src/oauth/` owns `oidc-provider` configuration, custom interactions, standards-compliant client
  metadata, and provider adapters. Never implement authorization or token protocols by hand.
- `src/api/` owns Fastify setup, schemas, HTTP routes, the verification page/status endpoint, API
  authentication, centralized errors, OpenAPI generation, and development-only Swagger UI.
- `src/developers/` owns the UUID allowlist, developer/admin roles, OAuth-client ownership, the
  first-party Minecraft login handoff, and opaque Redis-backed console sessions.
- Shared infrastructure modules own PostgreSQL/Prisma and Redis clients and their lifecycle. Domain
  modules receive those dependencies rather than constructing extra clients.
- Translation resources own every user-facing string. English is the default and fallback locale.
- `src/generated/` contains generated artifacts and is never edited or committed.

PostgreSQL is durable storage for users, registered applications, refresh-token records, and any
durable `oidc-provider` adapter state. Redis owns short-lived verification records and ephemeral
provider state where atomic expiry and consumption are required. Do not duplicate provider-managed
authorization codes or access tokens in ad hoc application tables.

Verification records use a Redis state machine: `pending` → `processing` → `verified` →
`finalizing`. Lua claims give exactly one authenticated Minecraft connection and exactly one OIDC
interaction-completion request ownership of their respective transition. Persist the user only after
the Minecraft claim. Complete transitions conditionally with the same unguessable claim ID, or
restore the prior state only when downstream persistence definitively fails. Never replace these
scripts with read-then-write application logic.

## Required stack

- Use the active Node.js LTS release selected by `.nvmrc` and `.node-version`.
- Use strict TypeScript. `strict` and `noUncheckedIndexedAccess` must remain enabled. Do not use
  `any`, implicit `any`, or unchecked type assertions. A rare necessary assertion requires a nearby
  safety explanation and a narrowly scoped lint suppression with that justification.
- Use Fastify, never Express.
- Use `minecraft-protocol` for the ghost server and support the protocol-version range the library
  supports. Do not hardcode one Minecraft protocol version.
- Use `oidc-provider` for OAuth 2.0/OIDC authorization and token behavior.
- Use PostgreSQL through Prisma and Redis through the shared Redis client.
- Derive OpenAPI 3.1 from Fastify route schemas. Do not maintain a separate hand-written contract.

## Verification protocol

The verification flow is fixed:

1. A client sends a standard authorization request to `GET /oauth2/authorize`, including
   `response_type`, `client_id`, exact `redirect_uri`, `scope`, `state`, and S256 PKCE parameters.
2. A custom provider interaction generates a short, unique code without visually ambiguous
   characters (`0`, `O`, `1`, `I`, and lowercase `l` are forbidden). Store only the required
   verification record in Redis, keyed so it can be found from the interaction/session and from the
   code, with a five-minute TTL.
3. The interaction page tells the user to connect to `<code>.craftlogin.com`.
4. The ghost server reads `server_host` from the incoming handshake and extracts the leftmost code.
   Normalize and validate host input before lookup, including the optional Minecraft handshake port
   suffix. A missing or expired code receives a clear, non-technical disconnect message.
5. Continue the standard `minecraft-protocol` online-mode login sequence. Mojang/Microsoft session
   authentication is the identity security boundary; do not add custom anti-spoofing schemes.
6. After successful login, atomically consume the verification code, associate the authenticated
   UUID and username with its pending interaction, upsert the user, mark the interaction resolved,
   and immediately disconnect with a clear success message.
7. The accessible interaction page progressively enhances its initial server-rendered content with
   bounded polling, a short starting interval, and exponential backoff.
8. A resolved interaction resumes `oidc-provider`, which completes the standard authorization code,
   token, and `/api/users/@me` flow.

Never log verification codes, authorization codes, access/refresh tokens, client secrets, cookie
values, or password-equivalent material.

## OAuth and session security

- Require PKCE with `code_challenge_method=S256` for every confidential and public client.
- Require and validate `state` on every client callback flow. CraftLogin validates protocol inputs;
  integrating clients remain responsible for binding callback state to their initiating session.
- Redirect URIs are exact matches and may not contain wildcards.
- Authorization codes are single-use, expire after approximately 60 seconds, and are consumed with
  an atomic Redis operation or database transaction—never read and then deleted separately.
- Treat verification codes and refresh tokens with the same race-safety requirement. Concurrent
  redemption must have exactly one winner.
- Hash confidential-client secrets with Argon2 before persistence. A `null` `clientSecretHash`
  identifies a public client, which cannot safely possess a secret and must use PKCE.
- Persist only refresh-token hashes, never plaintext refresh tokens. Revocation and rotation must be
  transactional.
- Rate-limit `/oauth2/token`, `/api/apps`, and verification-status requests.
- OAuth client registration is never anonymous. `/api/apps` and the Developer Console require a
  current allowlisted developer session plus CSRF protection for state-changing requests.
- The final administrator cannot be removed or demoted. Preserve this invariant with a serializable
  database transaction; a read followed by a separate write is insufficient.
- Session cookies are signed, `HttpOnly`, `Secure`, and `SameSite=Lax`. Rotate session identifiers
  after authentication or another privilege change. Enforce sliding expiry and a separate absolute
  lifetime.
- Record session IP address and user agent only as anomaly signals. An IP change alone never
  invalidates a session.
- Production deployments require TLS at the public edge and trusted-proxy configuration that matches
  the actual proxy topology.

## Data and validation

The core Prisma models are:

- `User`: Minecraft UUID primary key, current username, first verification time, and last
  verification time. Do not add email, password, or unrelated PII.
- `App`: internal ID, public client ID, nullable secret hash for public-client support, display
  name, exact-match redirect URI array, creation time, and nullable developer ownership for legacy
  or deliberately unassigned clients.
- `Developer`: allowlisted Minecraft UUID, developer/admin role, and creation time. It is an access
  record, not a second identity profile, and must not gain email, password, or unrelated PII.
- `RefreshToken`: token hash, client ID, user UUID, expiry, optional revocation time, and the
  minimum provider-managed payload/index data required to implement the `oidc-provider` adapter
  contract. The raw token identifier must never be persisted.

Validate all untrusted input at its boundary with Fastify JSON Schema and, where domain parsing is
needed, Zod. Reject invalid input without coercion. Every route must declare request and response
schemas. Use one shared error envelope: `{ "error": { "code": string, "message": string } }`.
Implement typed application errors and one centralized Fastify error handler. Let the centralized
handler process awaited route failures; never create floating promises or unhandled rejections.

Use transactions, unique constraints, conditional writes, or atomic Redis commands whenever two
requests can mutate or consume the same state. Application-process locks are insufficient because
production may run multiple instances.

## Interaction UI and API documentation

The verification page must use semantic HTML, a correct heading hierarchy, visible keyboard focus,
sufficient contrast, and useful initial content without JavaScript. Polling is progressive
enhancement and must stop after a bounded number of attempts.

Extract all visible strings, including Minecraft disconnect reasons and API-safe public messages,
into translation resources from the start. Ship English as the fallback even if no other locale is
available.

Generate OpenAPI 3.1 from the same Fastify schemas that validate requests. Commit the generated
`openapi.yaml` as a reference artifact. Expose Swagger UI at `/docs` only outside production.

## Code conventions

- One module has one clear responsibility; avoid catch-all utility and service files.
- Prefer explicit dependency injection and narrow interfaces at process boundaries.
- Keep async failures observable. Await promises and route errors through typed/centralized
  handling.
- Comments explain non-obvious invariants, concurrency choices, protocol quirks, or safety. Do not
  narrate obvious operations.
- Use structured logs. Redact sensitive fields at the logger boundary before an object can be
  serialized.
- Do not disable lint rules globally. A local suppression requires a safety or compatibility reason
  on the suppression line.
- The root dependency overrides select patched transitive releases for Prisma CLI and
  `minecraft-protocol` dependencies. Re-test their consumers and run `npm audit` before changing or
  removing an override.
- Tests must be deterministic. Use unit tests for parsing and domain transitions, integration tests
  for Redis/PostgreSQL atomicity and adapters, and protocol/API tests for external behavior.
- Preserve unrelated working-tree changes. Never discard contributor work to make a task easier.

## Local development

Install Node.js 24, then install dependencies:

```sh
nvm use
npm install
```

Start the PostgreSQL and Redis services with an explicit development-only database password:

```sh
POSTGRES_PASSWORD=craftlogin-dev-only docker compose up -d postgres redis
```

Export matching local connection values, apply migrations, and start both public listeners through
the shared composition root:

```sh
export DATABASE_URL='postgresql://craftlogin:craftlogin-dev-only@localhost:5432/craftlogin?schema=public'
export REDIS_URL='redis://localhost:6379'
npm run db:migrate:deploy
npm start
```

The listeners can still be isolated during focused development:

```sh
npm run start:api
npm run start:mc
```

Bootstrap the first Developer Console administrator only from a trusted shell after migrations:

```sh
npm run admin:grant -- <canonical-minecraft-uuid>
```

The Developer Console and OIDC interactions require HTTPS because their cookies are always `Secure`.
Do not weaken this for local development; use a trusted local TLS reverse proxy and set
`HTTP_TRUST_PROXY=true` only while the HTTP listener is bound behind that controlled proxy.

The local development connection values in `prisma.config.ts` match the command above. They are
development-only credentials, not production secrets. Native PostgreSQL installations may use a
different password as long as `DATABASE_URL` matches. Create and apply a development migration once
a stage intentionally introduces migrations:

```sh
npm run db:generate
npx prisma migrate dev --name descriptive_name
```

Run the complete local quality gate:

```sh
npm run check
```

Individual checks are available as `npm run format:check`, `npm run lint`, `npm run typecheck`,
`npm run db:validate`, and `npm test`. Use `npm run format` to format supported source files and the
Prisma schema. `npm run openapi:generate` regenerates the committed OpenAPI 3.1 document directly
from Fastify route schemas; the complete gate rejects drift. Run the atomic Redis and PostgreSQL
adapter suites against isolated local services:

```sh
TEST_REDIS_URL=redis://localhost:6379 npm run test:integration:redis
TEST_DATABASE_URL="$DATABASE_URL" npm run test:integration:postgres
```

## Deployment rules

The Compose topology contains the combined HTTP/Minecraft application, PostgreSQL, and Redis with
health checks and a named PostgreSQL data volume. The application image uses a multi-stage
Dockerfile, a minimal final image, and a non-root runtime user. Its direct PID 1 composition root
shares one Prisma client and one Redis client between the listeners. Container startup applies
committed Prisma migrations with `prisma migrate deploy`, which is safe and idempotent; it never
uses `migrate dev` or `db push` in production. `/health` is a readiness endpoint and must continue
to check both PostgreSQL and Redis rather than reporting process liveness alone.

Document every environment variable in `.env.example`, commit no secrets, and keep production
defaults fail-closed. Maintain the root `README.md`, MIT `LICENSE`, generated `openapi.yaml`, and
this guide as required repository artifacts. The README must clearly state that CraftLogin is not
affiliated with Mojang or Microsoft.
