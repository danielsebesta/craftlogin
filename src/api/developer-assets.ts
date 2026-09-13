import { uiBaseStyles } from './ui/base.js';
import { uiControlStyles } from './ui/controls.js';

const consoleStyles = `
.console-header {
  border-bottom: 1px solid var(--line);
}

.console-header-inner {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s3) var(--s4);
  align-items: center;
  justify-content: space-between;
  min-height: 4rem;
}

.console-identity {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2) var(--s3);
  align-items: center;
  font-size: var(--t-xs);
  color: var(--muted);
}

.console-player {
  display: inline-flex;
  gap: var(--s2);
  align-items: center;
  color: var(--text);
}

.console-player-head {
  display: grid;
  width: 2rem;
  height: 2rem;
  overflow: hidden;
  place-items: center;
  background: var(--surface-raised);
  border: 1px solid var(--line-strong);
}

.console-player-head img {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  object-fit: contain;
}

.console-identity form {
  display: inline;
}

.console-main {
  padding-block: var(--s6) var(--s7);
}

.console-main > h1 {
  margin-bottom: var(--s3);
}

.console-section {
  margin-top: var(--s6);
}

.console-section-head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s3);
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--s4);
}

.app-avatar {
  display: block;
  width: 2.5rem;
  aspect-ratio: 1 / 0.74;
  overflow: hidden;
  background: #fff;
  border: 2px solid var(--line-strong);
}

.app-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}

.app-name {
  display: block;
  font-weight: 700;
}

.app-type {
  display: block;
  font-size: var(--t-xs);
  color: var(--muted);
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

.admin-grant {
  display: grid;
  gap: var(--s3);
  align-items: end;
  margin-bottom: var(--s5);
}

@media (min-width: 48rem) {
  .admin-grant {
    grid-template-columns: minmax(0, 1fr) 12rem auto;
  }
}

.role-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
  align-items: center;
  justify-content: flex-end;
}

.role-form select {
  width: auto;
  min-width: 9rem;
}

.credential {
  padding: var(--s4);
  background: var(--surface-raised);
  border: 2px solid var(--line-strong);
}

.credential dt {
  font-size: var(--t-xs);
  font-weight: 700;
  color: var(--muted);
}

.credential code {
  display: block;
  margin-top: var(--s2);
  overflow-wrap: anywhere;
}

.message-layout {
  display: grid;
  place-items: center;
  min-height: calc(100vh - 8rem);
  padding-block: var(--s7);
}

.message-card {
  display: grid;
  width: min(44rem, 100% - (2 * var(--s4)));
  gap: var(--s4);
}
`;

export const developerStyles = `${uiBaseStyles}${uiControlStyles}${consoleStyles}`;
