import { uiBaseStyles } from './ui/base.js';
import { uiControlStyles } from './ui/controls.js';

const landingPageStyles = `
.landing-hero {
  display: grid;
  gap: var(--s4);
  justify-items: center;
  max-width: 56rem;
  margin-inline: auto;
  padding-block: var(--s8) var(--s7);
  text-align: center;
}

.landing-hero h1 {
  max-width: 24ch;
  font-size: var(--t-3xl);
}

.landing-lead {
  max-width: 42rem;
  color: var(--muted);
  font-size: var(--t-lg);
  text-wrap: balance;
}

.landing-actions {
  justify-content: center;
  margin-top: var(--s2);
}

.landing-section {
  max-width: 60rem;
  margin-inline: auto;
  padding-block: var(--s7);
}

.landing-section + .landing-section {
  border-top: 1px solid var(--line);
}

.landing-section > h2 {
  justify-content: center;
  margin-bottom: var(--s4);
  text-align: center;
}

.landing-section > .section-intro {
  margin-inline: auto;
  text-align: center;
}

/* One card treatment for every grouped item on the page: steps, use cases,
   and get-started actions all share it so the sections read as one system. */
.card-grid {
  display: grid;
  gap: var(--s4);
  padding: 0;
  margin: 0;
  list-style: none;
}

.landing-card {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
}

.landing-card > .list-icon {
  margin-bottom: var(--s1);
  color: var(--accent);
}

.landing-card h3 {
  margin: 0;
}

.landing-card p {
  color: var(--muted);
}

/* The claims section presents "what your app receives" as one artifact: an
   identity panel whose header shows a real verified player and whose divided
   lower half explains each field. */
.player-card {
  max-width: var(--reading-width);
  margin-inline: auto;
}

.player-card-head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s4);
  align-items: center;
}

.player-card img {
  flex: none;
  width: 7rem;
  height: 7rem;
  image-rendering: pixelated;
}

.player-card-identity {
  display: grid;
  gap: var(--s1);
  min-width: 0;
}

.player-name {
  font-size: var(--t-xl);
  font-weight: 700;
  line-height: 1.25;
}

.player-uuid {
  color: var(--muted);
  font-size: var(--t-sm);
  overflow-wrap: anywhere;
}

.player-verified {
  display: flex;
  gap: var(--s2);
  align-items: center;
  margin-top: var(--s2);
  font-size: var(--t-sm);
}

.player-verified .list-icon {
  width: 1rem;
  height: 1rem;
  color: var(--accent);
}

.claim-list {
  display: grid;
  gap: var(--s4);
  padding-top: var(--s5);
  margin: var(--s5) 0 0;
  border-top: 1px solid var(--line);
}

.claim-row {
  display: grid;
  gap: var(--s1);
  min-width: 0;
}

.claim-row dd {
  margin: 0;
  color: var(--muted);
}

.chips-label {
  margin-block: var(--s6) var(--s3);
  color: var(--muted);
  font-size: var(--t-sm);
  text-align: center;
}

.scope-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s3);
  justify-content: center;
  padding: 0;
  margin: 0;
  list-style: none;
}

.scope-chips li {
  display: inline-flex;
  gap: var(--s2);
  align-items: baseline;
  padding: var(--s2) var(--s4);
  font-size: var(--t-sm);
  background: var(--surface);
  border: 1px solid var(--line);
}

/* The lookup form sits centered above the showcase; its label stays small and
   muted so the row of input + submit reads as one compact control. */
.avatar-lookup {
  display: grid;
  gap: var(--s2);
  max-width: 26rem;
  margin: 0 auto var(--s5);
}

.avatar-lookup > .field-label {
  text-align: center;
}

.avatar-lookup-row input {
  font-family: var(--font-mono);
}

/* Get-started cards pin their action to the bottom so the row stays level. */
.start-card > :last-child {
  margin-top: auto;
}

.start-card .button {
  align-self: flex-start;
}

.prompt-details summary {
  display: flex;
  gap: var(--s2);
  align-items: center;
  min-height: var(--control-height);
  color: var(--muted);
  font-size: var(--t-sm);
  cursor: pointer;
  list-style: none;
}

.prompt-details summary::-webkit-details-marker {
  display: none;
}

.prompt-details summary::before {
  color: var(--muted);
  content: "+";
  font-family: var(--font-mono);
}

.prompt-details[open] summary::before {
  content: "\\2212";
}

.prompt-details summary:hover {
  color: var(--text);
}

.prompt-details .code-block {
  max-height: 18rem;
  margin-top: var(--s3);
  overflow: auto;
  font-size: var(--t-xs);
  white-space: pre-wrap;
}

@media (min-width: 40rem) {
  .claim-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 48rem) {
  .card-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s5);
  }
}

@media (max-width: 40rem) {
  .landing-hero {
    padding-block: var(--s6);
  }

  .landing-section {
    padding-block: var(--s6);
  }
}

@media (max-width: 30rem) {
  .player-card-head {
    justify-content: center;
    text-align: center;
  }

  .player-verified {
    justify-content: center;
  }
}
`;

export const landingStyles = `${uiBaseStyles}${uiControlStyles}${landingPageStyles}`;
