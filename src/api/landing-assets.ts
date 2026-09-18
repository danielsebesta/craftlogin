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

.landing-hero {
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s4);
  max-width: 56rem;
  margin-inline: auto;
  padding-block: var(--s8) var(--s7);
  text-align: center;
}

/* Landing drops the app-shell chrome (the repeating cube texture and the
   single-color center rail with its side borders) for a clean edge-free page
   floating over the grid glow. */
@media (min-width: 74.01rem) {
  body::before,
  body::after {
    display: none;
  }
}

/* Grid glow only across the top of the landing page: an absolutely positioned
   layer the exact height of the asset scrolls away with the content, its lower
   edge melting into the plain single-color page background below. */
main.container {
  position: relative;
}

/* Full-bleed guard: the glow below escapes the centered content column to
   cover the whole viewport width without causing horizontal scrolling. */
body {
  overflow-x: clip;
}

main.container::before {
  position: absolute;
  top: 0;
  left: calc(50% - 50vw);
  right: calc(50% - 50vw);
  z-index: -1;
  height: min(calc(100vw * 530 / 690), 64rem);
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

/* Narrow viewports would compute only a short strip from the asset ratio, so
   the glow gets a taller minimum there and cover crops the sides instead of
   leaving a seam. */
@media (max-width: 34rem) {
  main.container::before {
    height: 24rem;
  }
}

@media (forced-colors: active) {
  main.container::before {
    display: none;
  }
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

.landing-steps,
.use-list {
  display: grid;
  gap: var(--s5);
  padding: 0;
  margin: 0;
  list-style: none;
}

.landing-steps li,
.use-list li {
  display: grid;
  gap: var(--s1);
  align-content: start;
}

.step-index {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: var(--t-sm);
}

.landing-steps h3,
.use-list h3 {
  margin: 0;
}

.landing-steps p,
.use-list p {
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
}

.avatar-card h3 {
  margin: 0;
}

/* Every view is a flat 2D render, so nearest-neighbor scaling keeps texels crisp. */
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
}

.endpoint-list code {
  color: var(--text);
}

.endpoint-list .muted {
  font-size: var(--t-sm);
  text-align: right;
}

.landing-ai-prompt {
  max-height: 32rem;
  margin-top: var(--s4);
  overflow: auto;
  white-space: pre-wrap;
}

@media (min-width: 48rem) {
  .landing-steps,
  .use-list {
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
