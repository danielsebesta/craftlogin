# CraftLogin

CraftLogin is an open-source OAuth 2.0 and OpenID Connect provider for Minecraft Java Edition
identities. A player proves ownership by joining a short-lived subdomain on an online-mode Minecraft
ghost server; relying applications receive the authenticated Minecraft UUID and current username
through standard OIDC endpoints. CraftLogin stores no email address or password.

> **CraftLogin is not affiliated with, endorsed by, or sponsored by Mojang or Microsoft.**

## How verification works

1. An application starts an authorization-code request with `state` and S256 PKCE.
2. CraftLogin displays an unambiguous, five-minute connection address such as
   `ABCDEFGH.craftlogin.com`.
3. The player joins that address with Minecraft Java Edition. The online-mode login sequence asks
   the Mojang/Microsoft session service to authenticate the client.
4. The ghost server records the authenticated UUID and username, then immediately disconnects the
   player with a success message.
5. The browser interaction resumes and `oidc-provider` issues the standard authorization response.

Verification, authorization-code consumption, and refresh-token rotation use atomic Redis or
PostgreSQL operations so concurrent redemption has one winner. Raw secrets, codes, and tokens are
not written to application logs.

## Requirements

- Node.js 24 (the active LTS line selected by `.nvmrc`)
- PostgreSQL 18 and Redis 8, or Docker with the Compose plugin
- A public HTTPS origin for production
- Wildcard DNS `*.craftlogin.com` pointing to the Minecraft listener
- TCP port 25565 reachable by Minecraft clients

## Local development

Install dependencies with the repository's Node.js version:

```sh
nvm use
npm install
```

Start PostgreSQL and Redis, then export connection strings that match your local credentials. For a
local PostgreSQL user `craftlogin` with password `dev`, for example:

```sh
export DATABASE_URL='postgresql://craftlogin:dev@localhost:5432/craftlogin?schema=public'
export REDIS_URL='redis://localhost:6379'
npm run db:migrate:deploy
npm start
```

`npm start` runs the HTTP/OIDC service and the Minecraft ghost server in one process. During focused
development they can instead be run separately with `npm run start:api` and `npm run start:mc`. The
developer landing page is available at <http://localhost:3000/>. Swagger UI is available at
<http://localhost:3000/docs> outside production. The generated OpenAPI 3.1 reference is committed as
[`openapi.yaml`](openapi.yaml).

OAuth interactions and the Developer Console use `Secure` cookies and therefore require HTTPS even
in local development. A local reverse proxy such as Caddy can terminate a trusted development
certificate while CraftLogin remains bound to loopback:

```sh
export OIDC_ISSUER='https://localhost:3443'
export HTTP_HOST='127.0.0.1'
export HTTP_TRUST_PROXY='true'
export MC_BASE_DOMAIN='127.0.0.1.nip.io'
npm start

# Run separately after trusting Caddy's local CA.
caddy reverse-proxy --from https://localhost:3443 --to http://127.0.0.1:3000
```

The `nip.io` development domain makes addresses such as `ABCDEFGH.127.0.0.1.nip.io` resolve to the
local machine, so the Minecraft client can use the exact address shown by CraftLogin without editing
`/etc/hosts`. Use your own wildcard DNS domain outside local, same-machine development.

### Developer Console

OAuth client registration is never anonymous. Bootstrap the first administrator from a trusted shell
after applying migrations, using the canonical UUID of their Minecraft Java Edition account:

```sh
npm run admin:grant -- 123e4567-e89b-42d3-a456-426614174000
```

Then open <https://localhost:3443/developers>. The administrator proves ownership of that UUID by
joining the displayed online-mode Minecraft address. Administrators can grant or revoke developer
UUIDs and roles; registered developers can create and remove their own public or confidential OAuth
clients. Confidential secrets are displayed once. Role changes are checked on every request and
rotate or revoke active console sessions.

For a built production image, run the compiled bootstrap command inside the application container:

```sh
docker compose exec app node dist/admin/grant-admin.js 123e4567-e89b-42d3-a456-426614174000
```

## Container deployment

Copy the environment template and fill every required blank. `POSTGRES_PASSWORD` and the password
inside `DATABASE_URL` must match; the database hostname in Compose is `postgres`.

```sh
cp .env.example .env
```

Generate two cookie-signing keys:

```sh
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log([randomBytes(32).toString('hex'), randomBytes(32).toString('hex')].join(','))"
```

Generate a private RSA JSON Web Key Set for `OIDC_JWKS`:

```sh
node --input-type=module -e "import { generateKeyPairSync, randomUUID } from 'node:crypto'; const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 }); console.log(JSON.stringify({ keys: [{ ...privateKey.export({ format: 'jwk' }), alg: 'RS256', kid: randomUUID(), use: 'sig' }] }))"
```

Treat both outputs as production secrets and store backup copies in a secret manager. Put each value
on its corresponding single line in `.env`, set a strong PostgreSQL password, set
`DATABASE_URL=postgresql://craftlogin:<URL-encoded-password>@postgres:5432/craftlogin?schema=public`,
and set the issuer and Minecraft base domain.

Build and start the complete topology:

```sh
docker compose up --build -d
docker compose ps
```

The image runs as the non-root `node` user. Its entrypoint runs committed migrations with
`prisma migrate deploy` before starting one process that owns both public listeners. The application
healthcheck calls `/health`, which verifies live PostgreSQL and Redis connectivity. PostgreSQL data
is kept in the named `postgres-data` volume; PostgreSQL and Redis are exposed only on loopback for
maintenance and integration tests.

Terminate TLS at a trusted reverse proxy and forward the public `OIDC_ISSUER` origin to the HTTP
port. Set `HTTP_TRUST_PROXY=true` only for the documented single-proxy topology; leave it false when
the application is directly exposed or when the proxy path is not controlled. Forward Minecraft TCP
traffic without rewriting its handshake hostname.

## Quality gates

Run the complete deterministic unit and static gate:

```sh
npm run check
```

Run the atomic integration suites against isolated local services:

```sh
TEST_REDIS_URL='redis://localhost:6379' npm run test:integration:redis
TEST_DATABASE_URL="$DATABASE_URL" npm run test:integration:postgres
```

Regenerate the committed API document after changing a route schema:

```sh
npm run openapi:generate
```

## Data and privacy

Durable user data is limited to Minecraft UUID, current username, and first/last verification times.
Registered client metadata and hashed refresh-token identifiers are stored in PostgreSQL. Redis
holds short-lived verification and ephemeral OIDC state. IP address and user agent are anomaly
signals only and an IP change does not invalidate a session by itself.

Developer access is an explicit PostgreSQL allowlist keyed only by Minecraft UUID. OAuth clients
record their owning developer; legacy or deliberately unassigned clients remain visible only to an
administrator. Developer Console sessions are opaque Redis records with signed `Secure`, `HttpOnly`,
`SameSite=Lax` cookies, sliding expiration, an absolute lifetime, CSRF protection, and rotation
after role changes.

## Interface

The web interface is dark only, uses one accent color, and shares a single component vocabulary
across the developer landing page, the Developer Console, and the end-user Minecraft sign-in
surface. It has no CSS framework and no asset build step: the styles live in `src/api/ui/` and are
served as generated stylesheets. Every interactive element has a visible keyboard focus ring, every
input has a visible label, and status messages are announced with a live region.

[`PRODUCT.md`](PRODUCT.md) records audiences and interface principles. [`DESIGN.md`](DESIGN.md)
records the color, typography, spacing, and component rules. A unit test enforces the flat, dark,
shadow-free, rounded-free contract.

## Typography

The web interface bundles the Pixeloid Sans, Pixeloid Sans Bold, and Pixeloid Mono typefaces by
GGBotNet. They are self-hosted as WOFF2 assets and distributed under the SIL Open Font License 1.1;
the required copyright notice and license are available in
[`public/fonts/OFL.txt`](public/fonts/OFL.txt). The CraftLogin source code remains MIT-licensed.

## License

CraftLogin is available under the [MIT License](LICENSE).
