import { fontFaceStyles } from './fonts.js';
import { uiTokenStyles } from './tokens.js';

export const uiBaseStyles = `${fontFaceStyles}${uiTokenStyles}
* {
  box-sizing: border-box;
}

html {
  background: var(--bg);
  -webkit-text-size-adjust: 100%;
  scrollbar-color: var(--line-strong) var(--bg);
  scrollbar-width: thin;
}

::-webkit-scrollbar {
  width: 0.75rem;
  height: 0.75rem;
}

::-webkit-scrollbar-track {
  background: var(--bg);
}

::-webkit-scrollbar-thumb {
  background: var(--line-strong);
  border: 2px solid var(--bg);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--accent-strong);
}

body {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  margin: 0;
  color: var(--text);
  background: var(--bg);
  font-family: var(--font-sans);
  font-size: var(--t-base);
  line-height: var(--leading-normal);
  overflow-wrap: anywhere;
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
  flex: 1;
  min-width: 0;
}

[hidden]:not([hidden="until-found"]) {
  display: none;
}

:where(form, fieldset, input, select, textarea, pre) {
  min-width: 0;
}

.container,
.page-column,
.page-header-inner,
.page-footer-inner {
  width: min(var(--page-width), 100% - (2 * var(--gutter)));
  margin-inline: auto;
}

.page-narrow {
  --page-width: var(--auth-width);
}

.page-narrow main {
  flex: none;
}

.page-header {
  padding-block: var(--s3);
}

.page-header-inner {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s3) var(--s4);
  align-items: center;
  justify-content: space-between;
}

/* Header nav links as quiet chips, identical on every page. */
.page-nav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
  min-width: 0;
}

.page-nav a {
  display: inline-flex;
  gap: var(--s2);
  align-items: center;
  min-height: var(--control-height);
  padding: var(--s1) var(--s3);
  color: var(--muted);
  text-decoration: none;
  border: 1px solid var(--line);
}

.page-nav a:hover {
  color: var(--text);
  border-color: var(--line-strong);
}

.page-nav a[aria-current="page"] {
  color: var(--text);
  border-color: var(--line-strong);
}

/* Collapsible navigation: the checkbox toggles without JavaScript. On wide
   screens the button stays hidden and the links render inline. */
.site-nav-button {
  display: none;
  align-items: center;
  justify-content: center;
  min-width: var(--control-height);
  min-height: var(--control-height);
  padding: var(--s1) var(--s3);
  color: var(--muted);
  border: 1px solid var(--line);
  cursor: pointer;
}

.site-nav-button:hover {
  color: var(--text);
  border-color: var(--line-strong);
}

.site-nav-button .site-nav-icon-close {
  display: none;
}

.site-nav-toggle:focus-visible + .site-nav-button {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

@media (max-width: 48rem) {
  .site-nav-button {
    display: inline-flex;
  }

  .page-nav {
    display: none;
    flex-direction: column;
    width: 100%;
  }

  .site-nav-toggle:checked ~ .page-nav {
    display: flex;
  }

  .site-nav-toggle:checked ~ .site-nav-button .site-nav-icon-open {
    display: none;
  }

  .site-nav-toggle:checked ~ .site-nav-button .site-nav-icon-close {
    display: block;
  }

  .page-nav a {
    justify-content: center;
  }
}

.brand {
  display: inline-flex;
  gap: var(--s2);
  align-items: center;
  min-width: 0;
  min-height: var(--control-height);
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
  max-width: 100%;
}

.brand-wordmark-image {
  display: block;
  width: min(100%, 15rem);
  height: auto;
  image-rendering: pixelated;
}

.page-narrow .page-header {
  margin-top: auto;
}

.page-narrow .page-header-inner {
  justify-content: center;
}

.page-narrow .page-footer {
  margin-top: auto;
  padding-block: var(--s4) var(--s6);
  text-align: center;
}

.page-narrow .page-footer-inner {
  justify-items: center;
  text-align: center;
  max-width: 36rem;
}

.page-narrow .footer-top {
  justify-content: center;
}

.page-footer {
  padding-block: var(--s5) var(--s6);
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: var(--t-xs);
}

.page-footer-inner {
  display: grid;
  gap: var(--s4);
}

.footer-top {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2) var(--s4);
  align-items: center;
  justify-content: space-between;
}

.footer-brand {
  display: inline-flex;
}

.footer-brand-image {
  display: block;
  width: auto;
  height: 1.25rem;
  image-rendering: pixelated;
}

.footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s3) var(--s4);
}

.footer-links a {
  display: inline-flex;
  align-items: center;
  min-height: var(--control-height);
  color: var(--muted);
  text-decoration: none;
}

.footer-links a:hover {
  color: var(--text);
  text-decoration: underline;
}

.footer-meta {
  display: grid;
  gap: var(--s1);
}

.footer-meta p {
  margin: 0;
  line-height: var(--leading-normal);
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

/* Ambient grid glow behind the page top that melts into the background. */
.page-backdrop::before {
  position: absolute;
  top: 0;
  right: calc(50% - 50vw);
  left: calc(50% - 50vw);
  z-index: -1;
  height: min(40rem, 100%);
  content: "";
  background: url("/assets/grid-fade.svg") top center / cover no-repeat;
  opacity: 0.1;
  mask-image: linear-gradient(to bottom, transparent, black 18%, black 50%, transparent);
  pointer-events: none;
}

@media (forced-colors: active) {
  .page-backdrop::before {
    display: none;
  }
}

@media (forced-colors: active) {
  :focus-visible {
    outline: 2px solid Highlight;
  }
}
`;
