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
  grid-template-columns: 12rem minmax(0, 1fr);
  gap: var(--s7);
  padding-block: var(--s6) var(--s7);
}

.docs-rail {
  min-width: 0;
}

.docs-toc {
  position: sticky;
  top: var(--s5);
  font-size: var(--t-sm);
}

.docs-toc h2 {
  margin-bottom: var(--s2);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
}

.docs-toc ol {
  padding: 0;
  margin: 0;
  list-style: none;
  border-left: 1px solid var(--line);
}

.docs-toc a {
  display: block;
  padding: var(--s1) 0 var(--s1) var(--s3);
  margin-left: -1px;
  color: var(--muted);
  text-decoration: none;
  border-left: 2px solid transparent;
}

.docs-toc a:hover {
  color: var(--text);
  border-left-color: var(--accent-strong);
}

.docs-toc a[aria-current] {
  color: var(--accent);
  font-weight: 700;
  border-left-color: var(--accent);
}

.docs-content {
  min-width: 0;
}

.docs-title {
  max-width: var(--measure);
}

.docs-content > .section-intro {
  margin-top: var(--s3);
  margin-bottom: 0;
}

.docs-section {
  padding-block: var(--s6);
}

.docs-section + .docs-section {
  border-top: 1px solid var(--line);
}

.docs-section > h2 {
  margin-bottom: var(--s3);
}

.docs-section > h3,
.flow-block > h3 {
  margin-block: var(--s5) var(--s2);
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
  width: 1%;
  white-space: nowrap;
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s5) var(--s6);
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
    gap: var(--s6);
  }

  .docs-toc {
    position: static;
  }

  .docs-toc ol {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s1) var(--s4);
    border-left: 0;
  }

  .docs-toc a {
    padding: var(--s1) 0;
    margin-left: 0;
    border-left: 0;
    border-bottom: 2px solid transparent;
  }

  .docs-toc a:hover {
    border-bottom-color: var(--accent-strong);
  }

  .docs-toc a[aria-current] {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }
}

@media (max-width: 48rem) {
  .docs-columns,
  .docs-steps,
  .docs-topics,
  .security-list {
    grid-template-columns: minmax(0, 1fr);
  }

  .docs-shell {
    gap: var(--s5);
    padding-block: var(--s5) var(--s6);
  }

  .docs-section {
    padding-block: var(--s5);
  }
}
`;

export const docsStyles = `${uiBaseStyles}${uiControlStyles}${docsPageStyles}`;
