import { uiBaseStyles } from './ui/base.js';
import { uiControlStyles } from './ui/controls.js';

const landingPageStyles = `
/* Landing header: no rule line below it; navigation links sit apart from each
   other as quiet chips on the raised surface instead of bare text links. */
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

/* Grid glow bands at the top and bottom of the landing page: absolutely
   positioned layers the exact height of the asset scroll away with the
   content, their inner edges melting into the plain page background so the
   middle of the page stays clear. */
main.container {
  position: relative;
  isolation: isolate;
}

/* Full-bleed guard: the glow below escapes the centered content column to
   cover the whole viewport width without causing horizontal scrolling. */
body {
  overflow-x: clip;
}

main.container::before,
main.container::after {
  position: absolute;
  left: calc(50% - 50vw);
  right: calc(50% - 50vw);
  z-index: -1;
  height: min(calc(100vw * 530 / 690), 64rem);
  content: "";
  background-image: url("/assets/grid-fade.svg");
  background-repeat: no-repeat;
  background-position: top center;
  background-size: cover;
  opacity: 0.1;
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    black 18%,
    black 50%,
    transparent 100%
  );
  mask-image: linear-gradient(to bottom, transparent 0%, black 18%, black 50%, transparent 100%);
  pointer-events: none;
}

main.container::before {
  top: 0;
}

/* The footer band mirrors the hero band: its dense edge sits at the bottom
   of the page and the middle of the page stays clear between them. */
main.container::after {
  bottom: 0;
  transform: scaleY(-1);
}

/* Narrow viewports would compute only a short strip from the asset ratio, so
   the glow gets a taller minimum there and cover crops the sides instead of
   leaving a seam. */
@media (max-width: 34rem) {
  main.container::before,
  main.container::after {
    height: 24rem;
  }
}

@media (forced-colors: active) {
  main.container::before,
  main.container::after {
    display: none;
  }
}

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

.section-intro {
  max-width: 44rem;
  margin-inline: auto;
  margin-bottom: var(--s5);
  color: var(--muted);
  text-align: center;
  text-wrap: pretty;
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
  padding: var(--s5);
  background: var(--surface);
  border: 1px solid var(--line);
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
  max-width: 44rem;
  padding: var(--s5);
  margin-inline: auto;
  background: var(--surface);
  border: 1px solid var(--line);
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

.avatar-lookup-row {
  display: flex;
  gap: var(--s2);
}

.avatar-lookup-row input {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
}

.avatar-lookup-row .button {
  flex: none;
}

.avatar-showcase {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 8rem), 1fr));
  gap: var(--s4);
  padding: 0;
  margin: 0;
  list-style: none;
}

.avatar-card {
  align-items: center;
  padding: var(--s4);
  text-align: center;
}

/* Every view samples nearest texels, so pixelated scaling stays crisp even on
   the angled head projection. */
.avatar-card img {
  width: 100%;
  max-width: 7rem;
  height: auto;
  aspect-ratio: 1;
  object-fit: contain;
  image-rendering: pixelated;
}

.avatar-card code {
  color: var(--muted);
  font-size: var(--t-xs);
  overflow-wrap: anywhere;
}

.avatar-credit {
  margin-top: var(--s4);
  color: var(--muted);
  font-size: var(--t-sm);
  text-align: center;
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
  min-height: 2rem;
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
