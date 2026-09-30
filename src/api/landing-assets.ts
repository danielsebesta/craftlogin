import { uiBaseStyles } from './ui/base.js';
import { uiControlStyles } from './ui/controls.js';

const landingPageStyles = `
/* Centered hero: headline over the pitch, air before the join-flow handoff. */
.landing-hero {
  display: grid;
  gap: var(--s8);
  padding-block: var(--s8);
}

.landing-hero-head {
  display: grid;
  gap: var(--s6);
  justify-items: center;
  text-align: center;
}

.landing-hero h1 {
  max-width: 26ch;
  font-size: var(--t-3xl);
  line-height: 1.1;
}

.landing-hero-side {
  display: grid;
  gap: var(--s5);
  justify-items: center;
}

.landing-lead {
  max-width: 42rem;
  color: var(--muted);
  font-size: var(--t-lg);
}

.landing-section {
  padding-block: var(--s8);
}

.section-head {
  display: grid;
  gap: var(--s3);
  justify-items: start;
  max-width: 40rem;
  margin-bottom: var(--s6);
}

.section-head h2 {
  font-size: var(--t-2xl);
}

.section-head p {
  color: var(--muted);
}

/* Split sections pin the head to a narrow rail beside a wide body. */
.landing-split {
  display: grid;
  gap: var(--s6);
  align-items: start;
}

.landing-split > .section-head {
  margin-bottom: 0;
}

/* The three hero windows are one sequence, so steps share a counter badge
   with the start-steps list below. */
.handoff,
.start-steps {
  counter-reset: step;
}

.handoff {
  --notch: 4px;
  --notched: polygon(
    var(--notch) 0,
    calc(100% - var(--notch)) 0,
    calc(100% - var(--notch)) var(--notch),
    100% var(--notch),
    100% calc(100% - var(--notch)),
    calc(100% - var(--notch)) calc(100% - var(--notch)),
    calc(100% - var(--notch)) 100%,
    var(--notch) 100%,
    var(--notch) calc(100% - var(--notch)),
    0 calc(100% - var(--notch)),
    0 var(--notch),
    var(--notch) var(--notch)
  );
  display: grid;
  gap: var(--s6);
  padding: 0;
  margin: 0;
  list-style: none;
}

.handoff-step {
  display: grid;
  gap: var(--s4);
  min-width: 0;
}

.handoff-copy {
  display: grid;
  gap: var(--s2);
  align-content: start;
}

.handoff-copy p {
  color: var(--muted);
}

.handoff-step h3,
.start-steps h3 {
  display: flex;
  gap: var(--s3);
  align-items: center;
  counter-increment: step;
}

.handoff-step h3::before,
.start-steps h3::before {
  display: grid;
  flex: none;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  line-height: 1;
  border: 2px solid var(--line-strong);
  content: counter(step);
}

.handoff-visual {
  position: relative;
  min-width: 0;
}

.handoff-arrow {
  display: none;
}

/* Pixel-notched window frames echo the Minecraft GUI tooltip border: a 2px
   line-strong shell around a clipped inner panel. */
.demo-window {
  height: 100%;
  padding: 2px;
  background: var(--line-strong);
  clip-path: var(--notched);
}

.demo-window-inner {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100%;
  background: var(--surface);
  clip-path: var(--notched);
}

.demo-bar {
  display: flex;
  gap: var(--s2);
  align-items: center;
  padding: var(--s2) var(--s3);
  color: var(--muted);
  font-size: var(--t-xs);
  border-bottom: 2px solid var(--line-strong);
}

.demo-body {
  display: grid;
  gap: var(--s3);
  align-content: center;
  min-width: 0;
  padding: var(--s4);
}

/* The middle handoff window is a decorative auto-cycling demo: all three
   method panels stack in one grid cell so switching never changes the window
   size. The container spans the whole tab-free inner grid and its single row
   is 1fr, so each panel fills the window like the siblings' bar plus body. */
.method-panels {
  display: grid;
  grid-row: 1 / -1;
  grid-template-rows: 1fr;
}

.method-panel {
  display: grid;
  grid-area: 1 / 1;
  grid-template-rows: auto 1fr;
  min-width: 0;
}

/* Hidden panels keep their cell so every method shows the same window frame. */
.method-panel:not([data-active]) {
  visibility: hidden;
}

.method-panel-game .demo-body {
  background: var(--bg);
}

.demo-skin {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--s2) var(--s3);
  align-items: center;
  justify-items: start;
}

.demo-skin-face {
  grid-row: span 2;
  width: 2.5rem;
  height: 2.5rem;
  image-rendering: pixelated;
  border: 2px solid var(--line-strong);
}

.demo-hint {
  color: var(--muted);
  font-size: var(--t-xs);
}

.demo-button {
  display: inline-flex;
  gap: var(--s2);
  align-items: center;
  justify-content: center;
  justify-self: center;
  min-height: var(--control-height);
  padding: 0.5rem 1rem;
  color: var(--control-ink);
  background: var(--control);
  border: 2px solid var(--control);
  cursor: default;
}

/* Grayscale plus extreme contrast thresholds the stone logo to pure black and white. */
.demo-button img {
  width: 1.5rem;
  height: 1.5rem;
  filter: grayscale(1) contrast(100);
}

.demo-button-secondary {
  justify-self: stretch;
  color: var(--text);
  background: transparent;
  border-color: var(--line-strong);
}

.demo-label {
  color: var(--muted);
  font-size: var(--t-xs);
}

.demo-field {
  display: flex;
  align-items: center;
  padding: var(--s2) var(--s3);
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  background: var(--bg);
  border: 2px solid var(--line-strong);
}

.demo-typed {
  flex: none;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.demo-result {
  display: grid;
  gap: var(--s2);
  justify-items: center;
}

.demo-result-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2) var(--s3);
  align-items: center;
  justify-content: center;
}

.demo-result-face {
  width: 2.5rem;
  height: 2.5rem;
  image-rendering: pixelated;
  border: 2px solid var(--accent);
}

.demo-result-status {
  display: inline-flex;
  gap: var(--s1);
  align-items: center;
  color: var(--accent);
  font-size: var(--t-sm);
}

.demo-result-sub {
  max-width: 100%;
  overflow: hidden;
  color: var(--muted);
  font-size: var(--t-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (min-width: 40rem) {
  .landing-hero h1 {
    font-size: var(--t-4xl);
  }
}

@media (min-width: 40rem) and (max-width: 63.99rem) {
  .handoff-step {
    grid-template-columns: minmax(0, 6fr) minmax(0, 5fr);
    column-gap: var(--s5);
    align-items: center;
  }
}

@media (min-width: 64rem) {
  .landing-hero h1 {
    font-size: var(--t-5xl);
  }

  .landing-split {
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: var(--s7);
  }

  /* Subgrid rows keep all three windows the same height and their captions
     aligned; each step spans the shared window and caption rows. */
  .handoff {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    column-gap: var(--s7);
    row-gap: var(--s4);
  }

  .handoff-step {
    grid-row: span 2;
    grid-template-rows: subgrid;
  }

  /* The arrow rides the shared column gap, centered on the window edge. */
  .handoff-arrow {
    display: block;
    position: absolute;
    top: 50%;
    left: calc((var(--s7) + 1.5rem) / -2);
    color: var(--muted);
    transform: translateY(-50%);
  }
}

/* The typed address and the result card are the one animated moment: they
   only exist when motion is allowed, and settle on the final state. */
@media (prefers-reduced-motion: no-preference) {
  .demo-typed {
    animation: demo-typing 1.1s steps(23) 0.5s both;
  }

  /* The caret is a sibling of the clipped text so it never eats into the
     23ch width; it blinks a few times after typing, then is gone. */
  .demo-field::after {
    flex: none;
    width: 0.55em;
    height: 1em;
    margin-left: var(--s1);
    background: var(--accent);
    animation: demo-caret 2s steps(1) 0.5s forwards;
    content: "";
  }

  .demo-result {
    animation: demo-result-in 0.9s steps(3) 2s backwards;
  }
}

@keyframes demo-typing {
  from {
    width: 0;
  }

  to {
    width: 23ch;
  }
}

@keyframes demo-caret {
  0% {
    opacity: 1;
  }

  62% {
    opacity: 0;
  }

  69% {
    opacity: 1;
  }

  76% {
    opacity: 0;
  }

  83% {
    opacity: 1;
  }

  90%,
  100% {
    opacity: 0;
  }
}

@keyframes demo-result-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

/* Forced-colors has no clip-path art, so the windows get a real border. */
@media (forced-colors: active) {
  .demo-window {
    padding: 0;
    clip-path: none;
  }

  .demo-window-inner {
    border: 2px solid CanvasText;
    clip-path: none;
  }
}

.use-rows {
  padding: 0;
  margin: 0;
  list-style: none;
}

/* Lines only between rows — no frame around the list itself. */
.use-row {
  display: grid;
  gap: var(--s4);
  padding-block: var(--s5);
}

.use-row + .use-row {
  border-top: 1px solid var(--line);
}

.use-copy {
  display: grid;
  gap: var(--s2);
}

.use-copy p {
  color: var(--muted);
}

.use-line {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
  align-items: center;
}

.use-face {
  width: 1.5rem;
  height: 1.5rem;
  image-rendering: pixelated;
}

.use-tag {
  padding: 0 var(--s2);
  font-size: var(--t-xs);
  border: 1px solid var(--line-strong);
}

.use-status {
  display: flex;
  gap: var(--s2);
  align-items: center;
  margin-top: var(--s2);
  color: var(--accent);
  font-size: var(--t-sm);
}

.use-time {
  color: var(--muted);
  font-size: var(--t-xs);
}

.use-message {
  margin-top: var(--s3);
}

@media (min-width: 40rem) {
  .use-row {
    grid-template-columns: minmax(0, 1fr) 17rem;
    gap: var(--s5);
    align-items: center;
  }
}

/* The claims card pairs a verified player with the exact JSON payload shape. */
.identity {
  display: grid;
}

.identity-player {
  display: grid;
  gap: var(--s2);
  align-content: center;
  justify-items: center;
  padding: var(--s5);
  text-align: center;
}

.identity-avatar {
  width: 8rem;
  height: 8rem;
  image-rendering: pixelated;
}

.identity-name {
  font-size: var(--t-xl);
  font-weight: 700;
}

.identity-verified {
  color: var(--accent);
  font-size: var(--t-sm);
}

/* The check reads as a glyph on the first line, not an icon beside the
   two-line wrap. */
.identity-verified .ui-icon {
  display: inline;
  width: 1em;
  height: 1em;
  margin-right: var(--s1);
  vertical-align: -0.125em;
}

.payload-frame {
  padding: var(--s5);
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  background: var(--bg);
  border-top: 1px solid var(--line);
}

.payload-brace {
  color: var(--muted);
}

.payload {
  display: grid;
  gap: var(--s3);
  padding-left: 2ch;
}

.payload-row dt {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2) var(--s4);
  align-items: baseline;
  justify-content: space-between;
}

.payload-row dt code {
  min-width: 0;
  overflow-wrap: anywhere;
}

.payload-scope {
  flex: none;
  padding: 0 var(--s2);
  color: var(--muted);
  font-size: var(--t-xs);
  white-space: nowrap;
  border: 1px solid var(--line-strong);
}

.payload-row dd {
  padding-left: 2ch;
  margin: 0;
  color: var(--muted);
  font-family: var(--font-sans);
}

/* Landing-local token colors: the shared ones are scoped to .code-block. */
.payload .tok-key {
  color: var(--control);
}

.payload .tok-string {
  color: var(--accent);
}

@media (min-width: 48rem) {
  .identity {
    grid-template-columns: 14rem minmax(0, 1fr);
  }

  .payload-frame {
    border-top: 0;
    border-left: 1px solid var(--line);
  }
}

/* The lookup bar reads like the real endpoint: the path prefix is fixed
   chrome around a borderless input, and the whole box takes the focus ring. */
.bench-form {
  display: grid;
  gap: var(--s3);
  padding: var(--s5);
  border-bottom: 1px solid var(--line);
}

.bench-url {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
}

.bench-field {
  display: flex;
  flex: 1 1 18rem;
  align-items: stretch;
  padding-left: 0.75rem;
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  background: var(--bg);
  border: 2px solid var(--line-strong);
}

.bench-field:hover {
  border-color: var(--accent);
}

.bench-field:has(:focus-visible) {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.bench-path {
  display: flex;
  flex: none;
  align-items: center;
  color: var(--muted);
}

.bench-field input {
  flex: 1;
  min-width: 0;
  min-height: calc(var(--control-height) - 4px);
  padding: 0.5rem 0.75rem 0.5rem 0.25rem;
  font-family: var(--font-mono);
  background: transparent;
  border: 0;
}

.bench-field input:focus-visible {
  outline: none;
}

/* Display heights stay on exact skin-texel multiples so the pixelated
   scaling never blurs a texel edge. */
.bench-stage {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: var(--s5);
  margin: 0;
  list-style: none;
}

/* Each cell anchors its render to the bottom, so every figure in a row
   shares a baseline and the labels line up. */
.bench-view {
  display: grid;
  gap: var(--s2);
  align-content: end;
  justify-items: center;
  min-width: 0;
}

.bench-view img {
  align-self: end;
  width: auto;
  max-width: 100%;
  image-rendering: pixelated;
}

.bench-view img[data-avatar-view="face"] {
  width: 4rem;
  height: 4rem;
}

.bench-view img[data-avatar-view="bust"] {
  width: 5rem;
  height: 5rem;
}

.bench-view img[data-avatar-view="body"],
.bench-view img[data-avatar-view="side"],
.bench-view img[data-avatar-view="back"] {
  height: 6rem;
  aspect-ratio: 9 / 16;
  object-fit: cover;
}

/* Wings spreads wider than a body crop allows, so it letterboxes inside the
   full column width, still anchored to the shared baseline. */
.bench-view img[data-avatar-view="wings"] {
  width: 100%;
  height: 6rem;
  object-fit: contain;
  object-position: bottom;
}

.bench-view code {
  color: var(--muted);
  font-size: var(--t-xs);
  text-align: center;
}

.bench .avatar-credit {
  padding-inline: var(--s5);
  margin-top: var(--s3);
  text-align: left;
}

.bench {
  padding-bottom: var(--s4);
}

@media (min-width: 40rem) {
  .bench-stage {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .bench-view img[data-avatar-view="face"] {
    width: 5rem;
    height: 5rem;
  }

  .bench-view img[data-avatar-view="bust"] {
    width: 6rem;
    height: 6rem;
  }

  .bench-view img[data-avatar-view="body"],
  .bench-view img[data-avatar-view="side"],
  .bench-view img[data-avatar-view="back"] {
    height: 8rem;
  }

  .bench-view img[data-avatar-view="wings"] {
    height: 8rem;
  }
}

/* The ledger is the honest list: what CraftLogin stores vs never stores. */
.ledger {
  display: grid;
  gap: var(--s6);
}

.ledger-list {
  padding: 0;
  margin: 0;
  list-style: none;
}

.ledger-list li {
  display: flex;
  gap: var(--s3);
  align-items: center;
  padding-block: var(--s3);
  border-bottom: 1px solid var(--line);
}

.ledger-icon {
  color: var(--accent);
}

.ledger-never .ledger-icon {
  color: var(--danger);
}

@media (min-width: 40rem) {
  .ledger {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.start-band {
  padding: var(--s6);
}

.start-grid {
  display: grid;
  gap: var(--s5);
}

.start-steps {
  display: grid;
  gap: var(--s5);
  align-content: start;
  padding: 0;
  margin: 0;
  list-style: none;
}

.start-steps li {
  display: grid;
  gap: var(--s2);
  align-content: start;
  justify-items: start;
}

.start-steps p,
.agent p {
  color: var(--muted);
}

.agent {
  display: grid;
  gap: var(--s3);
  align-content: start;
  justify-items: start;
  padding-top: var(--s5);
  border-top: 1px solid var(--line);
}

.agent .code-block {
  justify-self: stretch;
  width: 100%;
  max-height: 12rem;
  margin: 0;
  overflow: auto;
  font-size: var(--t-xs);
  white-space: pre-wrap;
  background: var(--bg);
}

@media (min-width: 64rem) {
  .start-band {
    padding: var(--s7);
  }

  .start-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  }

  .agent {
    padding-top: 0;
    padding-left: var(--s5);
    border-top: 0;
    border-left: 1px solid var(--line);
  }
}

@media (max-width: 40rem) {
  .landing-section {
    padding-block: var(--s7);
  }
}
`;

export const landingStyles = `${uiBaseStyles}${uiControlStyles}${landingPageStyles}`;
