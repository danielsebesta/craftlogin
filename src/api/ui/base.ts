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
  position: relative;
  min-height: 100vh;
  margin: 0;
  color: var(--text);
  background: var(--bg);
  font-family: var(--font-sans);
  font-size: var(--t-base);
  line-height: 1.6;
}

::selection {
  color: var(--bg);
  background: var(--accent);
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

.container,
.page-column,
.page-header-inner,
.page-footer-inner {
  width: min(var(--page-width), 100% - (2 * var(--s4)));
  margin-inline: auto;
}

.page-narrow {
  --page-width: 42rem;
}

.page-header {
  border-bottom: 1px solid var(--line);
}

.page-header-inner {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s3) var(--s4);
  align-items: center;
  justify-content: space-between;
  min-height: 4rem;
}

.page-nav a {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  color: var(--muted);
  text-decoration: none;
}

.page-nav a:hover {
  color: var(--text);
  text-decoration: underline;
}

.page-nav a[aria-current="page"] {
  color: var(--text);
  text-decoration: underline;
}

.brand {
  display: inline-flex;
  gap: var(--s2);
  align-items: center;
  min-height: 2.75rem;
  color: var(--text);
  font-weight: 700;
  text-decoration: none;
}

.brand:hover {
  color: var(--text);
}

.brand-mark {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
}

.page-footer {
  padding-block: var(--s5);
  color: var(--muted);
  font-size: var(--t-xs);
  border-top: 1px solid var(--line);
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

/* The ambient cube texture is a wide-screen detail: the center rail covers it
   everywhere else, so narrow viewports skip both layers entirely. */
@media (min-width: 74.01rem) {
  body::before {
    position: fixed;
    inset: 0;
    z-index: 0;
    content: "";
    background-color: var(--pattern);
    pointer-events: none;
    -webkit-mask-image: url("/assets/background.svg");
    mask-image: url("/assets/background.svg");
    -webkit-mask-repeat: repeat;
    mask-repeat: repeat;
    -webkit-mask-size: 8.5rem auto;
    mask-size: 8.5rem auto;
  }

  body::after {
    position: fixed;
    inset: 0;
    z-index: 0;
    width: min(calc(var(--container) + (2 * var(--s4))), 100%);
    margin-inline: auto;
    content: "";
    background: var(--bg);
    border-inline: 1px solid var(--line);
    pointer-events: none;
  }

  body > * {
    position: relative;
    z-index: 1;
  }
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

@media (prefers-contrast: more) {
  body::before,
  body::after {
    display: none;
  }
}

@media (forced-colors: active) {
  :focus-visible {
    outline: 2px solid Highlight;
  }
}
`;
