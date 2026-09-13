import { uiBaseStyles } from './ui/base.js';
import { uiControlStyles } from './ui/controls.js';

/**
 * The landing main element is a plain container: the hero sits directly on the
 * page canvas and every following section is separated by one rule.
 */
const landingPageStyles = `
.landing-hero {
  display: grid;
  gap: var(--s4);
  justify-items: start;
  max-width: 48rem;
  padding-block: var(--s8) var(--s7);
}

.landing-hero h1 {
  max-width: 22ch;
}

.landing-hero .lead {
  font-size: var(--t-lg);
}

.landing-hero .button-row {
  margin-top: var(--s2);
}

.landing-section {
  padding-block: var(--s7);
  border-top: 1px solid var(--line);
}

.landing-section > h2 {
  margin-bottom: var(--s5);
}

.landing-section > h3 {
  margin-block: var(--s6) var(--s3);
}

.landing-section > p {
  max-width: var(--measure);
  color: var(--muted);
}

.landing-section .code-block {
  margin-top: var(--s4);
}

.endpoint-list {
  display: grid;
  padding: 0;
  margin: 0;
  list-style: none;
  border-top: 1px solid var(--line);
}

.endpoint-list li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2) var(--s4);
  align-items: baseline;
  justify-content: space-between;
  padding-block: var(--s3);
  border-bottom: 1px solid var(--line);
}

.endpoint-list code {
  color: var(--text);
}

.endpoint-list .muted {
  font-size: var(--t-sm);
  text-align: right;
}

.flow-list {
  display: grid;
  gap: var(--s5);
  padding-left: var(--s5);
  max-width: var(--measure);
}

.flow-list li::marker {
  color: var(--muted);
  font-family: var(--font-mono);
}

.flow-list h3 {
  margin-bottom: var(--s1);
}

.flow-list p {
  color: var(--muted);
}

.landing-section .summary-list {
  margin-top: var(--s5);
}

@media (max-width: 40rem) {
  .endpoint-list li {
    justify-content: flex-start;
  }

  .endpoint-list .muted {
    text-align: left;
  }
}
`;

export const landingStyles = `${uiBaseStyles}${uiControlStyles}${landingPageStyles}`;
