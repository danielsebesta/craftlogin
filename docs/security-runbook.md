# Security runbook

Operational procedures for secret rotation, incident signals, and recovery. All commands assume a
production deployment managed through environment variables; never commit rotated material to the
repository.

## Secret rotation

### OIDC cookie keys (`OIDC_COOKIE_KEYS`)

Format: comma-separated list, minimum two distinct values, each at least 32 characters. The first
key signs new cookies; every listed key verifies existing ones.

1. Generate a key: `openssl rand -base64 48` (or
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`).
2. **Prepend** the new key: `OIDC_COOKIE_KEYS=<new>,<old-a>,<old-b>`.
3. Rolling-restart all instances. Existing sessions stay valid.
4. After the longest session lifetime has passed (interaction cookies are temporary; the
   `__Host-craftlogin_session` developer cookie is bounded by its absolute lifetime), drop the old
   keys so the list returns to two entries.

An emergency rotation that invalidates everything is acceptable during a confirmed compromise:
replace all keys at once, which logs out every session.

### Token signing keys (`OIDC_JWKS`)

Format: JSON `{"keys":[<JWK>, ...]}` containing private RSA/EC keys.

1. Generate a new key with a unique `kid`, `use: "sig"`, and `alg: "RS256"`.
2. Add it to the array alongside the existing key(s) and rolling-restart. `oidc-provider` publishes
   every key in `/oauth2/jwks`, so verifiers pick up the new key automatically while old tokens
   still validate.
3. After the longest access-token/ID-token lifetime has passed, remove the old key and restart
   again.
4. On confirmed key compromise: replace the set entirely and restart. Outstanding tokens fail
   validation immediately; clients must re-authenticate.

### Microsoft OAuth secret (`MICROSOFT_OAUTH_CLIENT_SECRET`)

1. Create a second client secret in the Entra app registration.
2. Update `MICROSOFT_OAUTH_CLIENT_SECRET` to the new value and restart.
3. Delete the old secret in Entra only after all instances run the new value. Rotating while
   instances differ breaks the `microsoft-oauth` verification path but does not affect the Minecraft
   or skin-marker paths.

### Database and Redis credentials

- `DATABASE_URL` carries the Postgres password. Rotate in Postgres, update the secret,
  rolling-restart. Old-password overlap requires keeping both roles or accepting a brief window of
  failed connections.
- `REDIS_URL` embeds the optional Redis password (`redis://:<password>@host`). Compose runs Redis
  with persistence disabled; rotate the `requirepass` value and the URL together, then restart app
  and Redis.

## Incident signals

Structured log events worth alerting on (all emitted via pino):

| Event                                                 | Meaning                                                | Response                                                            |
| ----------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| `developer_session_signal_changed`                    | Session IP/UA changed mid-life                         | Investigate possible session theft; revoke via console session list |
| `developer_session_revoked`                           | Console session remotely revoked                       | Expected during incident response; confirm the actor                |
| `csp_violation`                                       | Browser reported a CSP violation via `/api/csp-report` | Check for an escaping regression or injected markup                 |
| `developer_app_deleted`, `admin_*`, `developer_app_*` | Audited console mutations (`audit: true`)              | Correlate with expected admin activity                              |
| 429 spikes                                            | Rate-limit pressure                                    | Check source IPs; consider edge rules before raising limits         |

## Data recovery

- PostgreSQL is the only durable store (users, apps, refresh-token records, provider adapter state).
  Schedule `pg_dump` snapshots (for example daily via cron/WAL-G) and test restore into a staging
  database.
- Redis is ephemeral (verification state, rate limits, sessions, OIDC grant cache). Losing it logs
  users out and drops in-flight verifications; it must never contain durable data, so
  `appendonly`/`save` stay disabled.
- Production volumes should live on encrypted storage (LUKS, cloud encrypted disks, or managed-DB
  encryption at rest).

## Supply chain

- CI runs `npm audit --audit-level=high`, Gitleaks secret scanning, SBOM generation
  (`npm sbom --sbom-format=cyclonedx`), and a Trivy image scan.
- Root `overrides` pin patched transitive releases; re-run `npm audit` and the affected tests before
  changing them.
- `npm ci --ignore-scripts` plus an explicit `npx prisma generate` keeps dependency install scripts
  out of CI.
