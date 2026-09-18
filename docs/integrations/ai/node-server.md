# AI prompt supplement: Node.js server

Append this to the [generic prompt](generic-oidc.md):

```text
Node.js supplement:
- Detect the existing server framework and session middleware before choosing dependencies.
- Prefer the current maintained major release of a standards-focused OIDC client such as openid-client, or the framework's established OIDC adapter when it performs full validation.
- Keep callback and token operations server-side. Do not send provider tokens to browser JavaScript merely to create a local session.
- Integrate with the existing framework's lifecycle, error handler, proxy trust configuration, cookies, and CSRF strategy.
- Use the project's package manager and module system. Do not introduce a second web framework or session store.
- Mock the OIDC boundary in unit tests and add a discovery-driven integration test if the project has an integration-test pattern.
```
