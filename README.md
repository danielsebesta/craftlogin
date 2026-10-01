# CraftLogin

> [!WARNING] Work in progress — not ready for production use. APIs, configuration, database
> migrations, and security behavior may change without notice.

CraftLogin is an open-source OAuth 2.0 and OpenID Connect provider for Minecraft Java Edition
accounts. A player proves ownership by joining a short-lived online-mode ghost server, publishing a
temporary marker in their Java skin, or completing one-shot Microsoft OAuth verification. Relying
applications receive the authenticated Minecraft UUID and current username through standard OIDC
endpoints. CraftLogin stores no email address or password.

> **NOT AN OFFICIAL MINECRAFT SERVICE. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.**
>
> CraftLogin is independently developed and operated by Daniel Šebesta. Contact:
> [contact@craftlogin.com](mailto:contact@craftlogin.com).

## Verification methods

All three methods converge on the same confirmation screen and resume the standard authorization
flow. Each maps to a distinct `acr`/`amr` in the resulting tokens:

- **Ghost server** (`urn:craftlogin:minecraft-online-mode`) — the interaction shows a code like
  `ABCDEFGH.craftlogin.com`; the player joins it with Minecraft Java Edition and the online-mode
  login authenticates the account. Connecting to the bare base domain opens a public void lobby that
  also accepts codes typed in chat or via `/verify`.
- **Skin marker** (`urn:craftlogin:minecraft-profile-skin`) — the player uploads a generated marked
  copy of their current skin; CraftLogin verifies Mojang's signed texture and the embedded marker.
- **Microsoft OAuth** (`urn:craftlogin:microsoft-oauth`) — one-shot sign-in through the
  personal-accounts endpoint with `XboxLive.signin` only, exchanged via Xbox Live, XSTS, and
  Minecraft Services after confirming a Java Edition entitlement. Provider tokens stay request-local
  and are never persisted.

Every method requires S256 PKCE and `state`, consumes codes atomically (one winner on concurrent
redemption), and never completes silently — the user must explicitly confirm or reject the verified
identity.

## Identity and client integration

See the [OIDC integration guide](docs/integrations/oidc.md), the generated
[OpenAPI 3.1 reference](openapi.yaml), or the machine-readable contract at `/llms.txt` and
`/llms-full.txt` on a running instance.

- Issuer discovery: `/.well-known/openid-configuration`
- Scopes: `openid profile` (+ `offline_access` for refresh tokens)
- Claims: `sub` = canonical Minecraft UUID (stable account key), `preferred_username` = current
  username (display only — it can change), `picture` = current avatar URL
- Opaque access tokens introspect at `POST /oauth2/introspect`; RP-initiated logout at
  `/oauth2/logout`

Anonymous public APIs resolve players (`GET /api/users/{name|uuid}`) and render avatar PNGs
(`/api/avatars/{uuid}/skin|face|bust|body|back|side|duo|wings`) from signed Mojang textures; see
`openapi.yaml` for the full contract.

## Requirements

- Node.js 24 (see `.nvmrc`)
- PostgreSQL 18 and Redis 8, or Docker with the Compose plugin
- A public HTTPS origin, wildcard DNS for `MC_BASE_DOMAIN`, and TCP port 25565 reachable by
  Minecraft clients
- A Microsoft Entra application approved for the Minecraft: Java Edition Game Service APIs (required
  only for the `microsoft-oauth` method; the other two work without it)

## Local development

```sh
nvm use
npm install
POSTGRES_PASSWORD='craftlogin-dev-only' docker compose up -d postgres redis
export DATABASE_URL='postgresql://craftlogin:craftlogin-dev-only@localhost:5432/craftlogin?schema=public'
export REDIS_URL='redis://localhost:6379'
export MICROSOFT_OAUTH_CLIENT_ID='your-personal-accounts-application-id'
npm run db:migrate:deploy
npm start
```

`npm start` runs the HTTP/OIDC service and the Minecraft ghost server in one process
(`npm run start:api` / `npm run start:mc` run them separately). The landing page is at
<http://localhost:3000/>, the integration guide at `/docs/`, Swagger UI at `/docs/swagger/` outside
production.

Interactions and the Developer Console use `Secure` cookies and need HTTPS even locally. Terminate a
trusted certificate at a loopback proxy and use a wildcard-friendly dev domain:

```sh
export OIDC_ISSUER='https://localhost:3443'
export HTTP_HOST='127.0.0.1'
export HTTP_TRUST_PROXY='true'
export MC_BASE_DOMAIN='127.0.0.1.nip.io'
npm start

# After trusting Caddy's local CA:
caddy reverse-proxy --from https://localhost:3443 --to http://127.0.0.1:3000
```

### Developer Console

OAuth client registration is never anonymous. Bootstrap the first administrator by Minecraft name or
canonical UUID:

```sh
npm run admin:grant -- Notch
```

Then open `/developers`. The console is a first-party OIDC client on the standard authorization flow
— there is no parallel login. Administrators manage developer roles and application verification
labels; developers create public or confidential clients with 64×64 PNG icons. `DEVELOPER_OWNER`
optionally pins an operator account that cannot be demoted and is re-granted on every boot.

## Container deployment

```sh
cp .env.example .env   # fill every required blank; POSTGRES_PASSWORD must match DATABASE_URL
docker compose up --build -d
```

Generate the two required secrets and treat them as production secrets:

```sh
# OIDC_COOKIE_KEYS — two distinct keys, comma-separated
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log([randomBytes(32).toString('hex'), randomBytes(32).toString('hex')].join(','))"

# OIDC_JWKS — private RSA key set
node --input-type=module -e "import { generateKeyPairSync, randomUUID } from 'node:crypto'; const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 }); console.log(JSON.stringify({ keys: [{ ...privateKey.export({ format: 'jwk' }), alg: 'RS256', kid: randomUUID(), use: 'sig' }] }))"
```

Register `${OIDC_ISSUER}/interaction/microsoft/callback` as the Microsoft app's exact redirect URI;
Minecraft Services returns `403` until the app ID passes Microsoft's AppID review
(`/.well-known/microsoft-identity-association.json` is served automatically).

The entrypoint applies committed migrations via `prisma migrate deploy`, the healthcheck calls
`/health` (live PostgreSQL + Redis), and PostgreSQL/Redis stay loopback-bound. Terminate TLS at a
trusted reverse proxy, forward `OIDC_ISSUER` to the HTTP port and Minecraft TCP untouched, and set
`HTTP_TRUST_PROXY=true` only for the documented single-proxy topology.

## Quality gates

```sh
npm run check                  # format, lint, typecheck, schema validation, OpenAPI drift, unit tests
TEST_REDIS_URL='redis://localhost:6379' npm run test:integration:redis
TEST_DATABASE_URL='<isolated-test-db-url>' npm run test:integration:postgres
npm run openapi:generate       # regenerate openapi.yaml after schema changes
```

## Data and privacy

Durable identity data is the Minecraft UUID, current username, and first/last verification times.
PostgreSQL additionally holds registered clients and hashed refresh-token records; Redis holds only
short-lived verification and session state. Microsoft verification adds no durable data. Details:
`/privacy` on a running instance and `docs/security-runbook.md` for rotation and incident handling.

## Acceptable use

CraftLogin may not be used to impersonate Mojang or Microsoft, imply their approval, bypass
authentication or license checks, phish users, distribute malware, facilitate gambling, or support
unlawful or deceptive services. Integrators are responsible for their own disclosures and for
compliance with the Minecraft EULA and
[Usage Guidelines](https://www.minecraft.net/usage-guidelines).

## License

[MIT](LICENSE). The web interface bundles Pixeloid Sans / Pixeloid Mono typefaces (SIL OFL 1.1); see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
