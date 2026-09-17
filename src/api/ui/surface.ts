export const signInSurfaceStyles = `
.method-picker { display: grid; gap: var(--s3); padding: 0; border: 0; }
.method-picker legend { margin-bottom: var(--s2); font-size: var(--t-lg); font-weight: 700; }
.method-options { display: grid; gap: var(--s2); }
.method-option { display: flex; gap: var(--s3); align-items: flex-start; padding: var(--s3); border: 1px solid var(--line); cursor: pointer; }
.method-option:focus-within, .method-option:hover { border-color: var(--accent); }
.method-option input { flex: none; margin-top: .25rem; }
.method-option span { display: grid; gap: var(--s1); }
.method-option small { color: var(--muted); }
[data-method-panel][hidden] { display: none; }
.skin-actions { display: flex; flex-wrap: wrap; gap: var(--s2); }
.skin-lookup-status { min-height: 1.4em; }

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
  gap: var(--s3);
  min-width: 0;
  text-align: center;
}

.consent-app {
  display: grid;
  gap: var(--s3);
  justify-items: center;
}

.verification-badge {
  display: inline-flex;
  gap: var(--s2);
  align-items: center;
  padding: var(--s1) var(--s2);
  border: 1px solid var(--line-strong);
  color: var(--muted);
  font-size: var(--t-xs);
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.verification-badge-icon {
  flex: none;
  width: 1.5rem;
  height: 1.5rem;
}

.verification-badge-verified {
  border-color: var(--accent);
  color: var(--accent-strong);
}

@media (forced-colors: active) {
  .verification-badge {
    border-color: currentColor;
  }
}

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

.consent-owner {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--s2) var(--s3);
  align-items: center;
  justify-self: center;
  font-size: var(--t-sm);
  color: var(--muted);
}

.consent-owner-avatar {
  width: 2rem;
  height: 2rem;
  background: var(--surface-raised);
  border: 2px solid var(--line);
  image-rendering: pixelated;
}

.consent-owner bdi {
  color: var(--text);
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

.consent-marker {
  flex: none;
  width: 0.6rem;
  height: 0.6rem;
  margin-top: 0.45rem;
  background: var(--accent);
}

.consent-verify,
.microsoft-verification,
.skin-verification {
  display: grid;
  gap: var(--s4);
}

.skin-download {
  justify-self: start;
}

.consent-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s3);
  align-items: center;
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

/* Sign-in pages share the landing look: no app-shell rails, an ambient grid
   glow, and no divider rules. The consent card keeps its window so the page
   feels official, just with a lighter one-pixel frame. */
@media (min-width: 74.01rem) {
  body.page-narrow::before,
  body.page-narrow::after {
    display: none;
  }
}

body.page-narrow {
  overflow-x: clip;
}

body.page-narrow .page-footer {
  border-top: 0;
}

body.page-narrow .page-header {
  border-bottom: 0;
}

body.page-narrow main.page-column {
  position: relative;
}

body.page-narrow main.page-column::before {
  position: absolute;
  top: 0;
  left: calc(50% - 50vw);
  right: calc(50% - 50vw);
  z-index: -1;
  height: min(calc(100vw * 530 / 690), 48rem);
  content: "";
  background-image: url("/assets/grid-fade.svg");
  background-repeat: no-repeat;
  background-position: top center;
  background-size: cover;
  opacity: 0.15;
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    black 18%,
    black 45%,
    transparent 100%
  );
  mask-image: linear-gradient(to bottom, transparent 0%, black 18%, black 45%, transparent 100%);
  pointer-events: none;
}

@media (max-width: 34rem) {
  body.page-narrow main.page-column::before {
    height: 24rem;
  }
}

@media (forced-colors: active) {
  body.page-narrow main.page-column::before {
    display: none;
  }
}

.consent-card {
  border-width: 1px;
}
`;
