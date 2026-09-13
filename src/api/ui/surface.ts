export const signInSurfaceStyles = `
.signin {
  display: grid;
  gap: var(--s6);
  padding-block: var(--s7) var(--s6);
}

.signin-compact {
  padding-block: 5rem var(--s6);
}

.signin-intro {
  display: grid;
  gap: var(--s4);
}

.signin-intro h1 {
  max-width: 24ch;
}

.signin-action {
  display: grid;
  gap: var(--s4);
  padding-top: var(--s6);
  border-top: 1px solid var(--line);
}

.consent-card {
  display: grid;
  gap: var(--s5);
}

.consent-identity {
  display: grid;
  gap: var(--s4);
}

.consent-title {
  display: grid;
  gap: var(--s2);
  min-width: 0;
}

/* The verified Minecraft account, rendered from its signed skin. */
.account-chip {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--s2) var(--s3);
  align-items: center;
  justify-self: start;
  font-size: var(--t-sm);
}

.account-chip-avatar {
  width: 2rem;
  height: 2rem;
  background: var(--surface-raised);
  border: 2px solid var(--accent);
  image-rendering: pixelated;
}

.account-chip-name {
  font-weight: 700;
}

.consent-scopes {
  display: grid;
  gap: var(--s3);
}

.consent-scopes ul {
  display: grid;
  gap: var(--s2);
  padding: 0;
  margin: 0;
  list-style: none;
}

.consent-scopes li {
  display: flex;
  gap: var(--s3);
  align-items: baseline;
}

.consent-check {
  flex: none;
  width: 1.5rem;
  height: 1.5rem;
  color: var(--bg);
  text-align: center;
  background: var(--accent);
  clip-path: circle(50%);
  font-family: var(--font-mono);
}

.consent-verify,
.microsoft-verification,
.skin-verification {
  display: grid;
  gap: var(--s4);
  padding-top: var(--s5);
  border-top: 1px solid var(--line);
}

.skin-download {
  justify-self: start;
}

.consent-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s3);
  align-items: center;
  padding-top: var(--s5);
  border-top: 1px solid var(--line);
}

.consent-actions .signin-continue {
  margin-left: auto;
}

.signin-address-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s3);
  align-items: center;
}

.signin-address {
  overflow-wrap: anywhere;
  font-family: var(--font-mono);
  font-size: var(--t-2xl);
  font-weight: 700;
  line-height: 1.2;
  color: var(--text);
}

.signin-status {
  display: flex;
  gap: var(--s2);
  align-items: baseline;
  min-height: 1.6em;
  color: var(--muted);
  transition: color 120ms ease-out;
}

.signin-status::before {
  flex: none;
  width: 0.5rem;
  height: 0.5rem;
  content: "";
  border: 2px solid var(--line-strong);
}

.signin-status[data-state="pending"]::before {
  background: var(--accent);
  border-color: var(--accent);
  animation: signin-pulse 1.6s ease-in-out infinite;
}

.signin-status[data-state="verified"] {
  color: var(--accent);
}

.signin-status[data-state="verified"]::before {
  background: var(--accent);
  border-color: var(--accent);
}

.signin-status[data-state="expired"],
.signin-status[data-state="network-error"],
.signin-status[data-state="stopped"] {
  color: var(--danger-strong);
}

.signin-status[data-state="expired"]::before,
.signin-status[data-state="network-error"]::before,
.signin-status[data-state="stopped"]::before {
  background: var(--danger);
  border-color: var(--danger);
}

@keyframes signin-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.25;
  }
}

.signin-continue[hidden] {
  display: none;
}
`;
