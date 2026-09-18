# AI prompt supplement: browser-only application

Append this to the [generic prompt](generic-oidc.md):

```text
Browser-only application supplement:
- The CraftLogin application must be registered as a public client. It must have no client secret.
- Prefer an existing backend-for-frontend and server-managed session when this repository has a server component. Explain before introducing a new BFF.
- If the application is genuinely browser-only, use a maintained browser OIDC client with Authorization Code Flow, PKCE S256, state, and nonce.
- Do not store access, ID, or refresh tokens in localStorage or other long-lived script-readable storage. Prefer in-memory storage and minimize token lifetime and scope.
- Account for reload, multi-tab, and callback transaction behavior without weakening state or PKCE checks.
- Configure an exact callback URL and test deployment base-path behavior. Never derive security-critical URLs from arbitrary query parameters.
- Explain the residual XSS/token-exposure risk of a browser-only architecture in the final report.
```
