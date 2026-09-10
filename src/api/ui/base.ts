import { fontFaceStyles } from './fonts.js';
import { uiTokenStyles } from './tokens.js';

export const uiBaseStyles = `${fontFaceStyles}${uiTokenStyles}
* {
  box-sizing: border-box;
}

html {
  min-width: 320px;
  background: var(--bg);
  -webkit-text-size-adjust: 100%;
}

body {
  min-height: 100vh;
  margin: 0;
  color: var(--text);
  background: var(--bg);
  font-family: var(--font-sans);
  font-size: var(--t-base);
  line-height: 1.6;
}

h1,
h2,
h3,
h4,
p,
figure,
blockquote,
dl,
dd,
ol,
ul {
  margin: 0;
}

h1,
h2,
h3 {
  line-height: 1.25;
  letter-spacing: -0.01em;
  text-wrap: balance;
}

h1 {
  font-size: var(--t-2xl);
}

h2 {
  font-size: var(--t-lg);
}

h3 {
  font-size: var(--t-base);
}

p {
  text-wrap: pretty;
}

a {
  color: var(--text);
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.18em;
}

a:hover {
  color: var(--accent-strong);
}

code,
pre,
kbd,
samp {
  font-family: var(--font-mono);
}

img,
svg {
  display: block;
  max-width: 100%;
}

button,
input,
select,
textarea {
  font: inherit;
}

a,
button,
label,
input,
select,
textarea {
  touch-action: manipulation;
}

:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.container {
  width: min(var(--container), 100% - (2 * var(--s4)));
  margin-inline: auto;
}

.surface-grid {
  background-color: var(--surface);
  background-image:
    linear-gradient(to right, var(--grid) 1px, transparent 1px),
    linear-gradient(to bottom, var(--grid) 1px, transparent 1px);
  background-size: 3rem 3rem;
}

.skip-link {
  position: absolute;
  top: var(--s3);
  left: var(--s3);
  z-index: 10;
  padding: var(--s2) var(--s3);
  color: var(--control-ink);
  text-decoration: none;
  background: var(--control);
  border: 2px solid var(--control);
  transform: translateY(-200%);
}

.skip-link:focus {
  transform: translateY(0);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  white-space: nowrap;
  border: 0;
  clip-path: inset(50%);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

@media (forced-colors: active) {
  :focus-visible {
    outline: 2px solid Highlight;
  }
}
`;
