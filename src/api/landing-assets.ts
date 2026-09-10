import { uiBaseStyles } from './ui/base.js';
import { uiControlStyles } from './ui/controls.js';

const landingPageStyles = `
.landing-hero {
  padding-block: var(--s7) var(--s6);
}

.landing-hero h1 {
  max-width: 24ch;
}

.landing-hero .lead {
  margin-top: var(--s4);
  font-size: var(--t-lg);
}

.landing-hero .button-row {
  margin-top: var(--s5);
}

.landing-section {
  padding-block: var(--s6);
  border-top: 1px solid var(--line);
}

.landing-section > h2 {
  margin-bottom: var(--s4);
}

.landing-section > h3 {
  margin-top: var(--s5);
  margin-bottom: var(--s3);
}

.landing-section > h2 + p,
.landing-section > p {
  max-width: var(--measure);
  color: var(--muted);
}

.landing-section .code-block {
  margin-top: var(--s4);
}

.endpoint-list {
  display: grid;
  gap: 0;
  padding: 0;
  margin: 0;
  list-style: none;
}

.endpoint-list li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2) var(--s4);
  padding-block: var(--s3);
  border-bottom: 1px solid var(--line);
}

.endpoint-list code {
  color: var(--text);
}

.flow-list {
  display: grid;
  gap: var(--s5);
  padding-left: var(--s5);
}

.flow-list li::marker {
  color: var(--muted);
  font-family: var(--font-mono);
}

.flow-list h3 {
  margin-bottom: var(--s1);
}

.flow-list p {
  max-width: 60ch;
  color: var(--muted);
}
`;

export const landingStyles = `${uiBaseStyles}${uiControlStyles}${landingPageStyles}`;
