# Integrate CraftLogin with your website

CraftLogin is an OpenID Connect (OIDC) provider for Minecraft Java Edition identities. Use a
maintained OIDC client library rather than implementing OAuth or token validation yourself.

## Before you start

Create an application in the CraftLogin Developer Console and record:

- the client ID;
- the client secret, shown once, for a confidential server-side client;
- every exact callback URI.

Choose a **confidential client** when a trusted backend can protect a secret. Browser-only, mobile,
desktop, and other clients that cannot protect a secret must be **public clients**. Never put a
client secret in browser code, a mobile binary, source control, logs, or an AI prompt.

## Discovery

Configure your OIDC library with the issuer and let it discover endpoint URLs:

```text
Issuer: https://craftlogin.com
Discovery: https://craftlogin.com/.well-known/openid-configuration
```

Do not infer endpoint paths in application code. Discovery is the authoritative protocol contract.

## Required authorization flow

Use Authorization Code Flow with all of the following:

- `response_type=code`;
- an exact registered `redirect_uri`;
- scope `openid profile`;
- a fresh, cryptographically random `state` bound to the initiating browser session;
- a fresh PKCE verifier and `code_challenge_method=S256`;
- a `nonce` when your OIDC library supports or requires one.

CraftLogin requires PKCE S256 for public **and** confidential clients. Validate and consume the
stored state exactly once on callback. Keep state, nonce, and the PKCE verifier server-side or in
appropriately protected, short-lived cookies.

Request `offline_access` only when the application genuinely needs a refresh token. Refresh tokens
are sensitive credentials and require protected storage and rotation handling.

## Callback and local session

Give the authorization response to the OIDC library. The library must validate the issuer,
signature, audience, expiry, nonce where applicable, and protocol response before your application
creates a session.

Use these claims as follows:

| Claim                | Meaning                         | Application use              |
| -------------------- | ------------------------------- | ---------------------------- |
| `sub`                | Stable canonical Minecraft UUID | Persistent account key       |
| `preferred_username` | Current Minecraft username      | Display only; it can change  |
| `picture`            | Current Minecraft avatar URL    | Profile image                |
| `acr`                | Verification context            | Optional policy/audit signal |
| `amr`                | Verification method             | Optional policy/audit signal |

Never key accounts, permissions, purchases, or bans by `preferred_username`. Rotate the
application's local session identifier after successful login and prevent open redirects in
return-to parameters.

The standard UserInfo endpoint can return the claims granted by the requested scopes. CraftLogin
also exposes `GET /api/users/@me` for a bearer access token, but a normal OIDC integration should
prefer the OIDC library and UserInfo support.

## Logout

Use the `end_session_endpoint` advertised by discovery when RP-initiated logout is needed. End the
local application session even if remote logout fails. Only allow preconfigured post-logout
destinations; never forward an arbitrary query parameter as a redirect.

## Secret and logging rules

Do not log or expose:

- client secrets;
- authorization codes;
- access or refresh tokens;
- state or nonce values;
- PKCE verifiers;
- session cookies;
- complete callback URLs containing protocol parameters.

Use environment variables or the project's established secret manager. Return generic user-facing
callback errors and keep sanitized diagnostics server-side.

## Suggested environment variables

```dotenv
CRAFTLOGIN_ISSUER=https://craftlogin.com
CRAFTLOGIN_CLIENT_ID=cl_replace_me
CRAFTLOGIN_CLIENT_SECRET=
CRAFTLOGIN_REDIRECT_URI=https://example.com/auth/craftlogin/callback
CRAFTLOGIN_POST_LOGOUT_REDIRECT_URI=https://example.com/
```

`CRAFTLOGIN_CLIENT_SECRET` is server-only and is omitted for public clients.

## Verification checklist

- Login succeeds and creates or finds a user by `sub`.
- A modified, missing, expired, or replayed state is rejected.
- PKCE uses S256 and a fresh verifier for every attempt.
- The callback URI exactly matches the Console registration.
- Callback errors do not disclose sensitive parameters.
- The local session rotates after login and is invalidated on logout.
- Username changes update display data without creating another account.
- Secrets and tokens are absent from browser bundles and logs.
- Automated tests cover success, callback denial, invalid state, and missing configuration.

## AI-assisted implementation

Copy the prompt from [`ai/generic-oidc.md`](ai/generic-oidc.md), or select a stack-specific
supplement:

- [Next.js and Auth.js](ai/nextjs-authjs.md)
- [Node.js server applications](ai/node-server.md)
- [Python applications](ai/python.md)
- [PHP applications](ai/php.md)
- [Browser-only applications](ai/spa.md)
- [Audit an existing integration](ai/review-existing-integration.md)

Do not paste a client secret into an AI tool. Give the agent only the environment-variable name.
