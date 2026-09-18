# Implement CraftLogin with an AI coding agent

These prompts help Claude Code, Codex, Cursor, Copilot, and similar agents add CraftLogin login to
an existing website.

1. Read the [canonical OIDC integration guide](../oidc.md).
2. Copy the [generic implementation prompt](generic-oidc.md).
3. Add the supplement for [Next.js/Auth.js](nextjs-authjs.md), [Node.js](node-server.md),
   [Python](python.md), [PHP](php.md), or a [browser-only SPA](spa.md).
4. Replace placeholders with the issuer, client ID, client type, and exact redirect URLs.
5. Never paste a client secret into an AI tool. Only name the server-side environment variable.
6. After implementation, run the [audit prompt](review-existing-integration.md) in a fresh agent
   context.

The prompt is intentionally agent-neutral. Framework and client type affect a correct OIDC
implementation more than the choice of coding agent.
