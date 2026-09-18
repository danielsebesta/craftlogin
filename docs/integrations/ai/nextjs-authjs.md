# AI prompt supplement: Next.js and Auth.js

Append this to the [generic prompt](generic-oidc.md):

```text
Next.js/Auth.js supplement:
- Determine the installed Next.js and Auth.js versions and whether the project uses App Router or Pages Router. Follow those exact APIs rather than examples for another major version.
- Implement CraftLogin as a generic OIDC provider using issuer discovery. Keep provider configuration and CRAFTLOGIN_CLIENT_SECRET in server-only modules.
- Use Auth.js's built-in OAuth checks for both state and PKCE S256; do not replace them with handwritten callback logic.
- Map profile.sub to the application's immutable CraftLogin/Minecraft UUID field. Do not key an account by preferred_username.
- Expose only the minimum identity fields needed by Client Components; do not copy access, ID, or refresh tokens into the browser session unless a documented server-side use requires them.
- Preserve existing Auth.js adapters, callbacks, account linking rules, and session strategy unless a narrowly necessary change is explained.
- Add route and callback tests using the project's existing Next.js test tooling.
```
