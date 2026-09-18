# AI prompt: implement CraftLogin OIDC

Replace the placeholders, then paste the prompt into Claude Code, Codex, Cursor, Copilot, or another
coding agent. Do not paste a client secret; provide only its environment-variable name.

```text
Implement “Sign in with CraftLogin” in this project.

First inspect the existing application, framework, routing, session management, environment-variable conventions, tests, and authentication dependencies. Reuse established patterns and do not replace unrelated authentication or session code. Before editing, summarize the architecture and implementation plan.

Configuration:
- OIDC issuer: {{CRAFTLOGIN_ISSUER}}
- Client ID: {{CRAFTLOGIN_CLIENT_ID}}
- Client type: {{public|confidential}}
- Exact redirect URI: {{EXACT_REDIRECT_URI}}
- Post-logout redirect URI: {{POST_LOGOUT_REDIRECT_URI}}
- Confidential client secret variable: CRAFTLOGIN_CLIENT_SECRET (never ask me to paste its value)

CraftLogin is a standard OpenID Connect provider. Read discovery metadata from:
{{CRAFTLOGIN_ISSUER}}/.well-known/openid-configuration

Requirements:
1. Use a maintained OIDC library suitable for this project's framework. Do not implement OAuth, token exchange, JWT validation, or discovery manually.
2. Use Authorization Code Flow and request “openid profile”. Request “offline_access” only if this application already requires persistent delegated access.
3. Generate a cryptographically random state for every attempt, bind it to the initiating browser session, validate it with constant-time facilities where provided, and consume it once.
4. Always use PKCE S256, including for a confidential client. Generate a fresh verifier securely and keep it with the short-lived login transaction.
5. Use a nonce when the selected OIDC library supports or requires one.
6. Keep state, nonce, and verifier server-side or in Secure, HttpOnly, SameSite=Lax, short-lived cookies. Do not use localStorage.
7. Match the configured redirect URI exactly. Do not use wildcards or derive it from untrusted Host or forwarded headers.
8. For a confidential client, keep CRAFTLOGIN_CLIENT_SECRET on the server. Never expose it to browser JavaScript, client bundles, logs, source control, rendered errors, or test snapshots. A public client must not use a client secret.
9. Let the OIDC library validate issuer, signature, audience, expiry, nonce, and the authorization response. Read endpoint paths from discovery rather than inventing them.
10. Use the OIDC “sub” claim as the stable account key. Treat it as the canonical Minecraft UUID. Use “preferred_username” only as a changeable display name and “picture” as the profile image. Preserve “acr” and “amr” if useful to application policy.
11. Rotate the application's local session identifier after login. Use Secure, HttpOnly, SameSite=Lax cookies in production and follow the project's existing CSRF protections.
12. Prevent open redirects: allow only local or explicitly configured return destinations.
13. Implement local logout and use the discovery “end_session_endpoint” for RP-initiated logout when supported. Do not accept arbitrary post-logout destinations.
14. Do not log client secrets, authorization codes, tokens, state, nonce, PKCE verifiers, cookies, or complete callback URLs.
15. Add accessible “Sign in with Minecraft” UI, callback error handling with non-sensitive messages, environment documentation, and tests.

Implement:
- login initiation;
- callback handling;
- create/find local user by “sub” and update display data separately;
- authenticated local session creation;
- current-user access;
- logout;
- configuration validation that fails closed;
- tests for success, provider denial, invalid/missing/replayed state, and missing configuration.

After editing, run the project's formatter, type checker, linter, and tests. Report changed files, environment variables, the exact redirect URI to register in CraftLogin, commands run, and remaining manual setup. If an input or framework fact is missing, stop and ask instead of guessing.
```
