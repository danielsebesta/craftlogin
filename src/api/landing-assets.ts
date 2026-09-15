import { uiBaseStyles } from './ui/base.js';
import { uiControlStyles } from './ui/controls.js';

const landingPageStyles = `
.landing-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s4);
  max-width: 56rem;
  margin-inline: auto;
  padding-block: var(--s8) var(--s7);
  text-align: center;
}

.landing-hero h1 {
  max-width: 20ch;
  margin-inline: auto;
  font-size: var(--t-3xl);
}

.landing-lead {
  max-width: 44rem;
  margin-inline: auto;
  color: var(--muted);
  font-size: var(--t-lg);
  text-wrap: pretty;
}

.landing-actions {
  justify-content: center;
  margin-top: var(--s2);
}

.landing-request {
  width: 100%;
  max-width: 44rem;
  margin-inline: auto;
  margin-top: var(--s5);
  text-align: left;
}

.landing-request figcaption {
  margin-bottom: var(--s2);
  color: var(--muted);
  font-size: var(--t-xs);
  font-weight: 700;
}

.landing-request .code-block {
  margin: 0;
}

.landing-section {
  max-width: 56rem;
  margin-inline: auto;
  padding-block: var(--s7);
  border-top: 1px solid var(--line);
}

.landing-section > h2,
.landing-section > .section-intro {
  text-align: center;
}

.landing-section > h2 {
  margin-bottom: var(--s4);
}

.landing-section > h3 {
  margin-block: var(--s6) var(--s3);
}

.section-intro {
  max-width: 46rem;
  margin-inline: auto;
  margin-bottom: var(--s5);
  color: var(--muted);
  text-wrap: pretty;
}

.landing-steps {
  display: grid;
  gap: var(--s5);
  padding: 0;
  margin: 0;
  list-style: none;
}

.landing-steps li {
  display: grid;
  gap: var(--s1);
}

.step-index {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: var(--t-sm);
}

.landing-steps h3 {
  margin: 0;
}

.landing-steps p {
  color: var(--muted);
}

.landing-example {
  margin-top: var(--s6);
}

.landing-section .code-block {
  margin-top: var(--s4);
}

.avatar-showcase {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
  gap: var(--s5);
  padding: 0;
  margin: 0;
  list-style: none;
}

.avatar-card {
  display: grid;
  gap: var(--s2);
  justify-items: center;
  padding: var(--s4);
  text-align: center;
  background: var(--surface-raised);
  border: 2px solid var(--line);
}

.avatar-card h3 {
  margin: 0;
}

.avatar-card img {
  width: 8rem;
  height: 8rem;
  image-rendering: pixelated;
}

.avatar-card code {
  font-size: var(--t-xs);
  overflow-wrap: anywhere;
}

.endpoint-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
  gap: 0 var(--s6);
  padding: 0;
  margin: 0;
  list-style: none;
}

.endpoint-list li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s1) var(--s4);
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

@media (min-width: 48rem) {
  .landing-steps {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s6);
  }
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
