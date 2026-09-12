export const signInSurfaceStyles = `
.signin-header,
.signin,
.signin-footer {
  width: min(42rem, 100% - (2 * var(--s4)));
  margin-inline: auto;
}

.signin-header {
  padding-block: var(--s5);
  border-bottom: 1px solid var(--line);
}

.consent-card {
  display: grid;
  gap: var(--s5);
}

.consent-identity {
  display: flex;
  gap: var(--s4);
  align-items: flex-start;
}

.consent-avatar {
  display: block;
  flex: none;
  width: 3rem;
  aspect-ratio: 1 / 0.74;
  overflow: hidden;
  background: #fff;
  border: 2px solid var(--line-strong);
}

.consent-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}

.consent-title {
  display: grid;
  gap: var(--s2);
  min-width: 0;
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
  font-family: var(--font-mono);
  color: var(--muted);
}

.consent-verify {
  display: grid;
  gap: var(--s4);
  padding-top: var(--s5);
  border-top: 1px solid var(--line);
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

.signin {
  display: grid;
  gap: var(--s6);
  padding-block: var(--s7) var(--s6);
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
  min-height: 1.6em;
  color: var(--muted);
}

.signin-status[data-state="verified"] {
  color: var(--accent);
}

.signin-status[data-state="expired"],
.signin-status[data-state="network-error"] {
  color: var(--danger-strong);
}

.signin-continue[hidden] {
  display: none;
}

.signin-footer {
  padding-block: var(--s5);
  font-size: var(--t-xs);
  color: var(--muted);
  border-top: 1px solid var(--line);
}
`;
