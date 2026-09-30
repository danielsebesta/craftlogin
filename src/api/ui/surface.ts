export const signInSurfaceStyles = `
.method-picker {
  display: grid;
  gap: var(--s3);
}

.method-picker legend {
  margin-bottom: var(--s2);
  font-size: var(--t-lg);
  font-weight: 700;
}

.method-options {
  display: grid;
  gap: var(--s2);
}

.method-option {
  display: flex;
  gap: var(--s3);
  align-items: flex-start;
  min-width: 0;
  padding: var(--s3);
  border: 1px solid var(--line);
  cursor: pointer;
}

.method-option:hover {
  border-color: var(--accent);
}

.method-option .list-icon {
  color: var(--accent);
}

.method-option span {
  display: grid;
  gap: var(--s1);
  min-width: 0;
}

.method-option small {
  color: var(--muted);
}

.skin-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
}

.skin-lookup-status {
  min-height: 1.4em;
}

.signin {
  display: grid;
  gap: var(--s6);
  padding-block: var(--s5) var(--s6);
}

.consent-card {
  display: grid;
  gap: var(--s5);
}

.consent-identity {
  display: grid;
  gap: var(--s4);
  justify-items: center;
}

.consent-title {
  display: grid;
  gap: var(--s3);
  min-width: 0;
  text-align: center;
}

.consent-title .icon-heading {
  justify-content: center;
}

.consent-title .lead {
  margin-inline: auto;
}

.consent-app {
  display: inline-flex;
  gap: var(--s2);
  align-items: center;
  justify-content: center;
  min-width: 0;
  font-size: var(--t-2xl);
  line-height: 1.25;
}

/* Quiet muted prefix line above the bold app name heading. */
.consent-title h1:not(.icon-heading) {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s1);
  color: var(--muted);
  font-weight: 400;
}

.consent-prefix {
  display: block;
  font-size: var(--t-base);
  font-weight: 400;
  color: var(--muted);
  line-height: 1.4;
}

.consent-app bdi {
  min-width: 0;
  color: var(--text);
  font-weight: 700;
  overflow-wrap: anywhere;
}

/* Application icons are 64x64 pixel art shown at native size above the title. */
.consent-app-icon {
  width: 4rem;
  height: 4rem;
  image-rendering: pixelated;
}

.verification-badge {
  display: inline-flex;
  flex: none;
  align-items: center;
  cursor: help;
}

/* Stepped orthogonal polygon keeps the pixel aesthetic in a circular silhouette. */
.verification-badge-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  color: var(--muted);
  background: var(--surface);
  border: 0;
  border-radius: 0;
  clip-path: polygon(
    30% 0%, 70% 0%,
    70% 10%, 80% 10%,
    80% 20%, 90% 20%,
    90% 30%, 100% 30%,
    100% 70%,
    90% 70%, 90% 80%,
    80% 80%, 80% 90%,
    70% 90%, 70% 100%,
    30% 100%,
    30% 90%, 20% 90%,
    20% 80%, 10% 80%,
    10% 70%, 0% 70%,
    0% 30%,
    10% 30%, 10% 20%,
    20% 20%, 20% 10%,
    30% 10%
  );
}

.verification-badge-icon {
  flex: none;
  width: 0.875rem;
  height: 0.875rem;
}

.verification-badge-verified .verification-badge-dot {
  color: var(--control-ink);
  background: var(--accent);
}

@media (forced-colors: active) {
  .verification-badge-dot {
    outline: 1px solid currentColor;
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
  flex: none;
  width: 2rem;
  height: 2rem;
  background: var(--surface);
  border: 2px solid var(--accent);
  image-rendering: pixelated;
}

.account-chip-name {
  font-weight: 700;
}

.account-chip-link {
  color: var(--muted);
  font-size: var(--t-xs);
}

.account-chip-link:hover {
  color: var(--accent-strong);
}

.skin-lookup-result {
  display: flex;
  gap: var(--s3);
  align-items: center;
  min-height: 2.5rem;
}

.skin-lookup-avatar {
  flex: none;
  width: 2.5rem;
  height: 2.5rem;
  image-rendering: pixelated;
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
  flex: none;
  width: 2rem;
  height: 2rem;
  image-rendering: pixelated;
}

.consent-owner bdi {
  color: var(--text);
  font-weight: 700;
}

.consent-permissions-grid {
  display: grid;
  gap: var(--s5);
}

.consent-scopes,
.consent-disallowed {
  display: grid;
  gap: var(--s3);
}

.consent-scopes ul,
.consent-disallowed ul {
  display: grid;
  gap: var(--s2);
  padding: 0;
  margin: 0;
  list-style: none;
}

.consent-scopes li,
.consent-disallowed li {
  display: flex;
  gap: var(--s3);
  align-items: flex-start;
}

.consent-scopes .list-icon,
.icon-note .list-icon {
  color: var(--accent);
}

.consent-disallowed .list-icon,
.consent-disallowed .heading-icon-disallowed {
  color: var(--danger);
}

.icon-note {
  display: flex;
  gap: var(--s3);
  align-items: flex-start;
}

.consent-verify,
.microsoft-verification,
.skin-verification,
.verified-confirmation {
  display: grid;
  gap: var(--s4);
}

.verified-confirmation .account-chip {
  font-size: var(--t-lg);
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
  gap: var(--s2);
  align-items: stretch;
}

.signin-address {
  flex: 1;
  display: grid;
  place-items: center;
  min-height: var(--control-height);
  padding: var(--s3) var(--s4);
  color: var(--text);
  background: var(--bg);
  border: 2px solid var(--line-strong);
  font-family: var(--font-mono);
  font-size: var(--t-xl);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.04em;
  overflow-wrap: anywhere;
  user-select: all;
}

.signin-status {
  display: flex;
  gap: var(--s2);
  align-items: baseline;
  min-height: 1.6em;
  color: var(--muted);
  transition: color var(--motion-duration) ease-out;
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

@media (prefers-reduced-motion: no-preference) {
  .signin-status[data-state="pending"]::before {
    animation: signin-pulse 1.6s ease-in-out infinite;
  }
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

@media (max-width: 40rem) {
  .signin-address {
    font-size: var(--t-lg);
  }

  .consent-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .consent-actions .button {
    width: 100%;
  }

  .consent-actions .signin-continue {
    margin-left: 0;
  }
}
`;
