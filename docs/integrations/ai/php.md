# AI prompt supplement: PHP

Append this to the [generic prompt](generic-oidc.md):

```text
PHP supplement:
- Detect Laravel, Symfony, or another framework and reuse its authentication, session, configuration, and CSRF conventions.
- Choose a maintained OIDC-capable package that supports discovery, state, PKCE S256, and ID-token validation. Do not treat a generic OAuth-only profile response as validated OIDC identity.
- Keep CRAFTLOGIN_CLIENT_SECRET and provider tokens in server configuration/storage, never templates or frontend assets.
- Regenerate the PHP session identifier after login and invalidate the session through the framework on logout.
- Add tests using the project's existing PHPUnit/Pest setup and mock the provider boundary.
```
