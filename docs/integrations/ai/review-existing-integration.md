# AI prompt: audit a CraftLogin integration

```text
Audit this CraftLogin OpenID Connect integration. Inspect code and configuration, but do not edit anything yet.

Use the issuer's /.well-known/openid-configuration as the protocol contract. Verify that:
- a maintained OIDC library handles discovery, token exchange, and token validation;
- Authorization Code Flow is used;
- state is cryptographically random, session-bound, validated, short-lived, and single-use;
- PKCE is always present with S256 and a fresh verifier;
- nonce is handled when applicable;
- redirect URIs match exactly and are not based on untrusted headers;
- confidential secrets remain server-only and public clients have no secret;
- issuer, signature, audience, expiry, nonce, and response errors are validated;
- “sub”, not “preferred_username”, is the persistent account key;
- local sessions rotate after login and use appropriate cookie and CSRF protections;
- return-to and post-logout redirects cannot become open redirects;
- refresh tokens, if requested, have justified use and protected storage;
- callback errors and logs disclose no codes, tokens, secrets, state, nonce, verifiers, cookies, or complete callback URLs;
- success, denial, invalid/missing/replayed state, and missing configuration have automated tests.

For every finding report severity, file and line, violated property, exploit or failure scenario, and minimal remediation. Also list controls you verified as correct and evidence for each. Distinguish confirmed findings from questions. Propose a patch plan, but wait for approval before changing code.
```
