import { uiBaseStyles } from './ui/base.js';
import { uiControlStyles } from './ui/controls.js';

const docsPageStyles = `
html {
  scroll-padding-top: var(--s6);
}

@media (prefers-reduced-motion: no-preference) {
  html {
    scroll-behavior: smooth;
  }
}

.docs-shell {
  display: grid;
  grid-template-columns: 13rem minmax(0, 1fr);
  gap: var(--s6);
  padding-block: var(--s7);
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
  min-height: var(--control-height);
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
}

.docs-title {
  max-width: var(--measure);
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

.docs-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s5);
  padding: 0;
  margin: 0;
  list-style: none;
}

.docs-steps li {
  min-width: 0;
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
  margin-top: var(--s3);
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
  min-width: 0;
  padding-left: var(--s5);
  border-left: 1px solid var(--line);
}

.docs-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s6);
}

.docs-columns > div {
  min-width: 0;
}

.docs-definition-table {
  min-width: 0;
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

.docs-topics dt {
  margin-bottom: var(--s2);
  font-weight: 700;
}

.docs-reference-link {
  max-width: var(--measure);
  margin-top: var(--s5);
}

.docs-section .summary-list,
.docs-section .avatar-showcase {
  margin-top: var(--s4);
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
    grid-template-columns: minmax(0, 1fr);
  }

  .docs-toc {
    position: static;
  }

  .docs-toc ol {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s2) var(--s4);
  }
}

@media (max-width: 48rem) {
  .docs-columns,
  .docs-steps,
  .docs-topics,
  .security-list,
  .avatar-docs {
    grid-template-columns: minmax(0, 1fr);
  }

  .docs-section {
    padding-block: var(--s6);
  }
}
`;

export const docsStyles = `${uiBaseStyles}${uiControlStyles}${docsPageStyles}`;
