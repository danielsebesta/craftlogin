import { uiBaseStyles } from './ui/base.js';
import { uiControlStyles } from './ui/controls.js';
import { signInSurfaceStyles } from './ui/surface.js';

const consoleStyles = `
.console-main {
  padding-block: var(--s6) var(--s7);
}

.console-intro {
  display: grid;
  gap: var(--s3);
  max-width: var(--measure);
}

.console-main > .notice {
  margin-top: var(--s4);
}

.console-session {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--s2) var(--s3);
  align-items: center;
  color: var(--muted);
  font-size: var(--t-xs);
}

.console-session-player {
  display: inline-flex;
  gap: var(--s2);
  align-items: center;
  color: var(--text);
  font-size: var(--t-sm);
}

.console-session-role {
  padding-inline: var(--s2);
  border: 1px solid var(--line-strong);
}

.console-session form {
  display: inline;
}

.console-session-head {
  flex: none;
  width: 2rem;
  height: 2rem;
  background: var(--surface-raised);
  image-rendering: pixelated;
}

.console-section {
  margin-top: var(--s6);
}

.console-section-head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s3);
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--s3);
  margin-bottom: var(--s4);
  border-bottom: 1px solid var(--line);
}

.console-section-link {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  font-size: var(--t-sm);
}

.app-name {
  display: block;
  font-weight: 700;
}

.app-meta {
  display: block;
  color: var(--muted);
  font-size: var(--t-xs);
  font-weight: 400;
}

.redirect-list {
  display: grid;
  gap: var(--s1);
  padding: 0;
  margin: 0;
  list-style: none;
}

.redirect-list code {
  overflow-wrap: anywhere;
}

.role-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
  align-items: center;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
  align-items: center;
  justify-content: flex-end;
}

.row-actions-stacked {
  align-items: flex-start;
  justify-content: flex-start;
}

.row-action-form {
  display: inline-flex;
}

/* Verification actions sit beside the destructive delete link, so they must not
   inherit its danger hover treatment. */
.table-actions .row-actions .button-quiet:hover,
.row-actions-stacked .button-quiet:hover {
  color: var(--text);
}

.verification-queue {
  display: grid;
  gap: var(--s3);
  padding-top: var(--s4);
  border-top: 1px solid var(--line);
}

.request-list {
  display: grid;
  gap: var(--s3);
  padding: 0;
  margin: 0;
  list-style: none;
}

.request-card {
  display: grid;
  gap: var(--s2);
  padding: var(--s4);
  background: var(--surface-raised);
  border: 1px solid var(--line);
}

.request-note {
  max-width: var(--measure);
  margin: 0;
  white-space: pre-wrap;
}

.role-form select {
  width: auto;
  min-width: 9rem;
}

.admin-grant {
  display: grid;
  gap: var(--s3);
  align-items: end;
  padding-bottom: var(--s5);
  margin-bottom: var(--s4);
  border-bottom: 1px solid var(--line);
}

@media (min-width: 48rem) {
  .admin-grant {
    grid-template-columns: minmax(0, 1fr) 12rem auto;
  }
}

.credential {
  display: grid;
  gap: var(--s2);
  padding: var(--s4);
  background: var(--surface-raised);
  border: 2px solid var(--line-strong);
}

.credential code {
  overflow-wrap: anywhere;
}

.message-layout {
  display: grid;
  place-items: center;
  min-height: calc(100vh - 12rem);
  padding-block: var(--s7);
}

.message-card {
  width: min(44rem, 100%);
}
`;

export const developerStyles = `${uiBaseStyles}${uiControlStyles}${signInSurfaceStyles}${consoleStyles}`;
