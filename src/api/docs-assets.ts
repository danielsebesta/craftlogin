import { uiBaseStyles } from './ui/base.js';
import { uiControlStyles } from './ui/controls.js';

const docsPageStyles = `
html {
  scroll-behavior: smooth;
  scroll-padding-top: var(--s6);
}

/* Docs share the landing chrome: no rule lines around the header and footer,
   navigation links as quiet chips instead of bare text links. */
.page-header {
  border-bottom: 0;
}

.page-footer {
  border-top: 0;
}

.page-nav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
}

.page-nav a {
  min-height: 2.5rem;
  padding: 0.25rem var(--s3);
  color: var(--muted);
  text-decoration: none;
  background: transparent;
  border: 1px solid var(--line);
}

.page-nav a:hover {
  color: var(--text);
  text-decoration: none;
  border-color: var(--accent);
}

.docs-shell {
  display: grid;
  grid-template-columns: 13rem minmax(0, 1fr);
  gap: clamp(var(--s6), 5vw, var(--s8));
  width: min(86rem, 100% - (2 * var(--s4)));
  margin-inline: auto;
  padding-block: var(--s6) var(--s8);
}

body {
  overflow-x: clip;
}

/* Like the landing page, docs drop the app-shell chrome (the repeating cube
   texture and the single-color center rail with its side borders) for a
   clean edge-free page floating over the grid glow. */
@media (min-width: 74.01rem) {
  body::before,
  body::after {
    display: none;
  }
}

.docs-shell {
  position: relative;
}

/* Same grid glow as the landing hero, melting into the page background. */
.docs-shell::before {
  position: absolute;
  top: 0;
  left: calc(50% - 50vw);
  right: calc(50% - 50vw);
  z-index: -1;
  height: min(calc(100vw * 530 / 690), 40rem);
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

@media (forced-colors: active) {
  .docs-shell::before {
    display: none;
  }
}

.docs-rail {
  min-width: 0;
}

.docs-toc {
  position: sticky;
  top: var(--s5);
}

.docs-toc h2 {
  margin-bottom: var(--s2);
  color: var(--muted);
  font-size: var(--t-sm);
}

.docs-toc ol {
  padding: 0;
  margin: 0;
  list-style: none;
}

.docs-toc a {
  display: flex;
  gap: var(--s2);
  align-items: center;
  min-height: 2.5rem;
  padding-block: var(--s1);
  color: var(--muted);
  font-size: var(--t-sm);
  text-decoration: none;
}

.docs-toc .nav-icon {
  color: var(--accent);
}

.docs-toc a:hover {
  color: var(--text);
}

.docs-content {
  min-width: 0;
  max-width: 68rem;
}

.docs-title {
  max-width: var(--measure);
  padding-top: var(--s7);
  font-size: var(--t-2xl);
}

.docs-content > .section-intro {
  margin-top: var(--s3);
}

.docs-section {
  padding-block: var(--s7);
}

.docs-section > h2 {
  margin-bottom: var(--s4);
}

.docs-section > h3,
.flow-block > h3 {
  margin-block: var(--s5) var(--s3);
}

.section-intro {
  max-width: var(--measure);
  margin-bottom: var(--s5);
  color: var(--muted);
  text-wrap: pretty;
}

.docs-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s5);
  padding: 0;
  margin: 0;
  list-style: none;
  counter-reset: docs-step;
}

.docs-steps li {
  position: relative;
  padding-top: var(--s5);
  counter-increment: docs-step;
}

.docs-steps li::before {
  position: absolute;
  top: 0;
  color: var(--accent);
  content: counter(docs-step, decimal-leading-zero);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
}

.docs-steps .list-icon {
  margin-bottom: var(--s2);
  color: var(--accent);
}

.docs-steps h3 {
  margin-bottom: var(--s2);
}

.docs-steps p,
.flow-block p,
.docs-topics dd {
  color: var(--muted);
}

.docs-code {
  max-width: 100%;
  margin-top: var(--s3);
  overflow: auto;
  white-space: pre;
}

.docs-callout {
  max-width: var(--measure);
  padding: var(--s4) var(--s5);
  margin-top: var(--s5);
  color: var(--text);
  border-left: 3px solid var(--accent);
  background: var(--surface);
}

.flow-block {
  padding-left: var(--s5);
  border-left: 1px solid var(--line);
}

.docs-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s6);
}

.docs-definition-table {
  min-width: 0;
}

.table-wrap {
  overflow-x: auto;
}

.docs-endpoints {
  min-width: 44rem;
}

.docs-endpoints th:nth-child(1),
.docs-endpoints td:nth-child(1) {
  width: 8rem;
}

.docs-endpoints th:nth-child(2),
.docs-endpoints td:nth-child(2) {
  width: 21rem;
}

.docs-endpoints code {
  overflow-wrap: anywhere;
}

.method {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 700;
}

.docs-topics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s5);
  padding: 0;
  margin: 0;
}

.docs-topics div {
  padding: var(--s4);
  background: var(--surface-raised);
}

.docs-topics dt {
  margin-bottom: var(--s2);
  font-weight: 700;
}

.docs-reference-link {
  max-width: var(--measure);
  margin-top: var(--s5);
}

.avatar-docs {
  display: grid;
  grid-template-columns: 16rem minmax(0, 1fr);
  gap: var(--s6);
  align-items: center;
}

.avatar-docs img {
  width: 16rem;
  height: 16rem;
  background: var(--surface-raised);
  image-rendering: pixelated;
}

.avatar-docs .docs-code {
  margin-top: 0;
}

.avatar-docs .summary-list {
  margin-top: var(--s4);
}

.avatar-docs .avatar-credit {
  margin-top: var(--s4);
  color: var(--muted);
  font-size: var(--t-sm);
}

.security-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 var(--s7);
  padding: 0;
  margin: 0;
  list-style: none;
}

.security-list li {
  display: grid;
  grid-template-columns: 2.5rem minmax(0, 1fr);
  gap: var(--s3);
  padding-block: var(--s2);
}

.security-list .list-icon {
  color: var(--accent);
}

@media (max-width: 58rem) {
  .docs-shell {
    grid-template-columns: 1fr;
  }

  .docs-rail {
    display: none;
  }
}

@media (max-width: 42rem) {
  .docs-hero,
  .docs-columns,
  .docs-steps,
  .docs-topics,
  .security-list,
  .avatar-docs,
  .hero-stats {
    grid-template-columns: 1fr;
  }

  .docs-section {
    padding-block: var(--s6);
  }

  .avatar-docs img {
    width: min(16rem, 100%);
    height: auto;
  }
}
`;

export const docsStyles = `${uiBaseStyles}${uiControlStyles}${docsPageStyles}`;
