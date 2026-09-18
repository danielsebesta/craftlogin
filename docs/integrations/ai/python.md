# AI prompt supplement: Python

Append this to the [generic prompt](generic-oidc.md):

```text
Python supplement:
- Detect Django, Flask, FastAPI, or another framework and reuse its existing authentication and session conventions.
- Prefer a maintained OIDC integration or Authlib-based framework client that performs discovery and validation. Do not decode a JWT as a substitute for validation.
- Keep token exchange and provider credentials server-side. Use the framework's protected session and CSRF facilities.
- Do not block an async server with synchronous HTTP calls; use the library mode appropriate to the application.
- Add tests with the project's current pytest/unittest setup, mocking discovery and provider responses at the HTTP or library boundary.
```
