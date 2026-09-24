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

.ui-icon,
.heading-icon,
.button-icon,
.nav-icon,
.list-icon {
  flex: none;
  width: 1.5rem;
  height: 1.5rem;
}

.icon-heading {
  display: flex;
  gap: var(--s3);
  align-items: center;
}

.icon-heading .heading-icon {
  color: var(--accent);
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

main {
  position: relative;
  isolation: isolate;
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
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
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
  gap: var(--s2);
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

.brand-wordmark {
  display: inline-flex;
  align-items: center;
}

.brand-wordmark-image {
  display: block;
  width: auto;
  height: 1.85rem;
  max-width: 100%;
  aspect-ratio: 2048 / 311;
}

.page-narrow .page-header {
  border-bottom: 0;
  margin-top: auto;
  padding-top: var(--s5);
}

.page-narrow .page-header-inner {
  justify-content: center;
  min-height: auto;
  padding-block: var(--s2);
}

.page-narrow .brand {
  justify-content: center;
}

.page-narrow .brand-wordmark-image {
  height: 2.75rem;
  max-width: 85vw;
}

.page-narrow .page-footer {
  border-top: 0;
  margin-top: auto;
  padding-block: var(--s4) var(--s6);
  text-align: center;
}

.page-narrow .page-footer-inner {
  align-items: center;
  text-align: center;
  max-width: 36rem;
}

.page-footer {
  padding-block: var(--s5);
  color: var(--muted);
  font-size: var(--t-xs);
  border-top: 1px solid var(--line);
}

.page-footer p {
  margin: 0;
  line-height: var(--leading-normal);
}

.page-footer-inner {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
}

.page-footer .footer-legal {
  font-size: 0.6875rem;
  letter-spacing: 0.02em;
  opacity: 0.75;
}

.footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s3);
}

.footer-links a {
  color: var(--muted);
  text-decoration: none;
  border-bottom: 1px solid var(--line);
}

.footer-links a:hover {
  color: var(--text);
}

.page-footer .footer-operator {
  font-size: 0.75rem;
  opacity: 0.9;
}

.page-footer .footer-note {
  font-size: 0.75rem;
  opacity: 0.9;
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
