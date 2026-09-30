import { uiBaseStyles } from './ui/base.js';
import { uiControlStyles } from './ui/controls.js';
import { signInSurfaceStyles } from './ui/surface.js';

const consoleStyles = `
.console-main {
  padding-block: var(--s7);
}

.console-intro {
  display: grid;
  gap: var(--s3);
  max-width: 48rem;
  padding-bottom: var(--s7);
}

.console-main > .notice {
  margin-bottom: var(--s5);
}

.console-session {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--s2);
  align-items: center;
  max-width: 100%;
  color: var(--muted);
  font-size: var(--t-xs);
  background: var(--surface);
  border: 1px solid var(--line);
}

.console-session-player {
  display: inline-flex;
  gap: var(--s2);
  align-items: center;
  min-width: 0;
  padding: var(--s1) 0 var(--s1) var(--s1);
  color: var(--text);
  font-size: var(--t-sm);
}

.console-session-role {
  padding: var(--s1) var(--s2);
  color: var(--accent-strong);
  border-left: 1px solid var(--line);
}

.console-session form {
  display: inline;
}

.console-session-head {
  flex: none;
  width: 2rem;
  height: 2rem;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  image-rendering: pixelated;
}

.console-workspace {
  display: grid;
  gap: var(--s5);
  align-items: start;
}

.console-section-head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s3);
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--s4);
  margin-bottom: var(--s5);
  border-bottom: 1px solid var(--line);
}

.console-section-link {
  font-size: var(--t-sm);
}

.app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
  gap: var(--s4);
  padding: 0;
  margin: 0;
  list-style: none;
}

.app-card article {
  display: grid;
  grid-template-rows: auto 1fr auto;
  height: 100%;
}

.app-card-header {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s3);
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--s4);
  border-bottom: 1px solid var(--line);
}

.app-card-identity {
  display: flex;
  gap: var(--s3);
  align-items: center;
  min-width: 0;
}

.app-card-identity > div {
  min-width: 0;
}

/* Icons are 64x64 pixel art; pixelated keeps them crisp at the 2rem preview. */
.app-card-icon {
  flex: none;
  width: 2rem;
  height: 2rem;
  image-rendering: pixelated;
}

.icon-preview {
  margin: 0;
}

.icon-preview img {
  width: 4rem;
  height: 4rem;
  image-rendering: pixelated;
  background: var(--surface);
  border: 1px solid var(--line);
}

.app-name {
  display: block;
  margin: 0;
  color: var(--text);
  font-size: var(--t-base);
  font-weight: 700;
}

.app-meta {
  display: block;
  color: var(--muted);
  font-size: var(--t-xs);
  font-weight: 400;
}

.app-card-details {
  display: grid;
  gap: var(--s4);
  padding: var(--s4);
  margin: 0;
}

.app-card-details > div {
  display: grid;
  gap: var(--s1);
  min-width: 0;
}

.app-card-details dt {
  color: var(--muted);
  font-size: var(--t-xs);
  font-weight: 700;
}

.app-card-details dd {
  min-width: 0;
  margin: 0;
}

.app-card-details code {
  overflow-wrap: anywhere;
}

.app-owner-chip {
  display: inline-flex;
  gap: var(--s2);
  align-items: center;
  font-size: var(--t-sm);
  color: var(--text);
}

.app-owner-head {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  image-rendering: pixelated;
}

.app-owner-name {
  font-weight: 600;
  overflow-wrap: anywhere;
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
  justify-content: flex-start;
}

.row-actions-stacked {
  align-items: flex-start;
  justify-content: flex-start;
}

.row-action-form {
  display: inline-flex;
}

.app-card-actions {
  padding: var(--s4);
  border-top: 1px solid var(--line);
}

.console-section > .empty-state {
  padding: var(--s7) var(--s5);
  text-align: center;
  border: 1px dashed var(--line-strong);
}

.account-sections {
  display: grid;
  gap: var(--s5);
  align-items: start;
}

.account-identity {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s4);
  align-items: flex-start;
}

.account-identity .summary-list {
  flex: 1;
  min-width: min(100%, 24rem);
}

.account-identity-avatar {
  flex: none;
  width: 3rem;
  height: 3rem;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  image-rendering: pixelated;
}

.scope-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s1);
  padding: 0;
  margin: 0;
  list-style: none;
}

.scope-tags li {
  padding: var(--s1) var(--s2);
  font-size: var(--t-xs);
  background: var(--surface);
  border: 1px solid var(--line);
}

.verification-queue {
  display: grid;
  gap: var(--s4);
  padding-top: var(--s5);
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
  gap: var(--s3);
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

.console-create,
.console-admin {
  padding-block: 0;
}

.console-admin {
  margin-top: var(--s5);
}

.console-create .disclosure-body,
.console-admin .disclosure-body {
  padding-bottom: var(--panel-padding);
}

.console-create .notice {
  margin-bottom: var(--s4);
}

@media (min-width: 48rem) {
  .admin-grant {
    grid-template-columns: minmax(0, 1fr) 12rem auto;
  }
}

@media (min-width: 64rem) {
  .console-workspace {
    grid-template-columns: minmax(0, 1.75fr) minmax(19rem, 0.75fr);
  }
}

.credential {
  display: grid;
  gap: var(--s2);
  padding: var(--s4);
  background: var(--surface);
  border: 2px solid var(--line-strong);
}

.credential code {
  overflow-wrap: anywhere;
}

.message-layout {
  display: grid;
  place-items: center;
  padding-block: var(--s7);
}

.message-card {
  width: min(var(--reading-width), 100%);
}
`;

export const developerStyles = `${uiBaseStyles}${uiControlStyles}${signInSurfaceStyles}${consoleStyles}`;
