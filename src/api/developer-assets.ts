import { uiBaseStyles } from './ui/base.js';
import { uiControlStyles } from './ui/controls.js';
import { signInSurfaceStyles } from './ui/surface.js';

const consoleStyles = `
.page-header,
.page-footer {
  border-color: transparent;
}

.page-header {
  background: color-mix(in oklch, var(--bg) 92%, transparent);
}

.page-header-inner,
.page-footer-inner {
  --page-width: 72rem;
}

body {
  overflow-x: clip;
}

@media (min-width: 74.01rem) {
  body::before,
  body::after {
    display: none;
  }
}

.console-main {
  position: relative;
  width: min(72rem, 100% - (2 * var(--s4)));
  padding-block: var(--s8);
}

.console-main::before,
.message-layout::before {
  position: absolute;
  top: 0;
  right: calc(50% - 50vw);
  left: calc(50% - 50vw);
  z-index: -1;
  height: 40rem;
  content: "";
  background-image: url("/assets/grid-fade.svg");
  background-repeat: no-repeat;
  background-position: top center;
  background-size: cover;
  opacity: 0.12;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 16%, black 42%, transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0%, black 16%, black 42%, transparent 100%);
  pointer-events: none;
}

.console-intro {
  display: grid;
  gap: var(--s3);
  max-width: 48rem;
  padding-bottom: var(--s7);
}

.console-intro h1 {
  font-size: var(--t-3xl);
}

.console-main > .notice {
  margin-bottom: var(--s5);
}

.console-session {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--s2);
  align-items: center;
  color: var(--muted);
  font-size: var(--t-xs);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 0;
  overflow: hidden;
}

.console-session-player {
  display: inline-flex;
  gap: var(--s2);
  align-items: center;
  padding: var(--s1) 0 var(--s1) var(--s1);
  color: var(--text);
  font-size: var(--t-sm);
}

.console-session-role {
  padding: var(--s1) var(--s2);
  color: var(--accent-strong);
  border-left: 1px solid var(--line);
}

.console-session .button {
  border-radius: 0;
}

.console-session form {
  display: inline;
}

.console-session-head {
  flex: none;
  width: 2rem;
  height: 2rem;
  background: var(--surface-raised);
  border: 1px solid var(--line-strong);
  image-rendering: pixelated;
}

.console-workspace {
  display: grid;
  gap: var(--s5);
  align-items: start;
}

.console-section {
  min-width: 0;
  padding: var(--s5);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 0;
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

.console-main .button,
.message-layout .button,
.console-main input:not([type="radio"]):not([type="checkbox"]),
.console-main select,
.console-main textarea,
.message-layout input:not([type="radio"]):not([type="checkbox"]),
.message-layout select,
.message-layout textarea {
  border-radius: 0;
}

.app-grid {
  display: grid;
  gap: var(--s4);
  padding: 0;
  margin: 0;
  list-style: none;
}

.app-card {
  min-width: 0;
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-radius: 0;
  overflow: hidden;
}

.app-card article {
  display: grid;
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

.app-card .verification-badge {
  border-radius: 0;
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
  padding: var(--s2) var(--s3);
  border-top: 1px solid var(--line);
}

.console-section > .empty-state {
  padding: var(--s7) var(--s5);
  text-align: center;
  border: 1px dashed var(--line-strong);
  border-radius: 0;
}

/* Verification actions sit beside the destructive delete link, so they must not
   inherit its danger hover treatment. */
.table-actions .row-actions .button-quiet:hover,
.row-actions-stacked .button-quiet:hover {
  color: var(--text);
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
  padding: var(--s4);
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-radius: 0;
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
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 0;
}

.console-create {
  padding-inline: var(--s5);
}

.console-admin {
  margin-top: var(--s5);
  padding-inline: var(--s5);
}

.console-create .choice {
  border-width: 1px;
}

.console-create .choice:first-child {
  border-radius: 0;
}

.console-create .choice:last-child {
  border-radius: 0;
}

.console-create .disclosure-body,
.console-admin .disclosure-body {
  padding-bottom: var(--s5);
}

.console-create .notice {
  margin-bottom: var(--s4);
}

@media (min-width: 48rem) {
  .admin-grant {
    grid-template-columns: minmax(0, 1fr) 12rem auto;
  }

  .app-card-details {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (min-width: 64rem) {
  .console-workspace {
    grid-template-columns: minmax(0, 1.75fr) minmax(19rem, 0.75fr);
  }

  .app-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
  position: relative;
  display: grid;
  place-items: center;
  min-height: calc(100vh - 12rem);
  padding-block: var(--s7);
}

.message-card {
  width: min(44rem, 100%);
  border-width: 1px;
  border-radius: 0;
}

@media (max-width: 40rem) {
  .console-main {
    width: min(100% - (2 * var(--s3)), 72rem);
    padding-block: var(--s7);
  }

  .console-section,
  .console-create,
  .console-admin {
    padding-inline: var(--s4);
  }

  .console-session-role {
    display: none;
  }

  .app-card-header,
  .app-card-details {
    padding: var(--s3);
  }

  .console-admin .table-wrap {
    margin-inline: calc(-1 * var(--s4));
    padding-inline: var(--s4);
  }
}

@media (forced-colors: active) {
  .console-main::before,
  .message-layout::before {
    display: none;
  }
}
`;

export const developerStyles = `${uiBaseStyles}${uiControlStyles}${signInSurfaceStyles}${consoleStyles}`;
