import { fontFaceStyles } from './font-assets.js';

export const landingStyles = `${fontFaceStyles}
:root {
  color-scheme: light;
  --primary: #246b45;
  --primary-dark: #195336;
  --primary-light: #e7f2eb;
  --ink: #202923;
  --muted: #657069;
  --background: #f7f8f6;
  --surface: #ffffff;
  --border: #dfe4e0;
  --dark: #17231c;
  --radius: 4px;
  --shadow: 0 1px 3px rgb(20 38 27 / 12%), 0 1px 2px rgb(20 38 27 / 8%);
  font-family: "Pixeloid Sans", sans-serif;
}

* {
  box-sizing: border-box;
}

html {
  min-width: 320px;
  background: var(--background);
}

body {
  min-height: 100vh;
  margin: 0;
  color: var(--ink);
  background: var(--background);
  font-size: 16px;
  line-height: 1.6;
}

a {
  color: var(--primary);
}

a:hover {
  color: var(--primary-dark);
}

a:focus-visible {
  outline: 3px solid #87c6a0;
  outline-offset: 3px;
}

code,
pre {
  font-family: "Pixeloid Mono", monospace;
}

.container {
  width: min(1080px, calc(100% - 32px));
  margin-inline: auto;
}

.navbar {
  min-height: 64px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 1px 2px rgb(20 38 27 / 5%);
}

.navbar .container {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--ink);
  font-size: 1.1rem;
  font-weight: 700;
  text-decoration: none;
}

.brand-mark {
  width: 22px;
  height: 22px;
  background: var(--primary);
  border: 5px solid #a9d2b9;
  box-shadow: inset 0 0 0 2px var(--primary-dark);
}

.navigation {
  display: flex;
  align-items: center;
  gap: 24px;
}

.navigation a {
  color: #465149;
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
}

.navigation a:hover {
  color: var(--primary);
}

.hero {
  padding: 72px 0 64px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(360px, 0.92fr);
  gap: 64px;
  align-items: center;
}

.eyebrow {
  margin: 0 0 12px;
  color: var(--primary);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.075em;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  max-width: 620px;
  margin-bottom: 20px;
  font-size: clamp(2.4rem, 6vw, 4rem);
  line-height: 1.08;
  letter-spacing: -0.015em;
}

.hero-lead {
  max-width: 640px;
  margin-bottom: 30px;
  color: var(--muted);
  font-size: 1.12rem;
  line-height: 1.7;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.button {
  display: inline-block;
  min-height: 44px;
  padding: 9px 18px;
  color: #ffffff;
  background: var(--primary);
  border: 1px solid var(--primary);
  border-radius: var(--radius);
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 24px;
  text-decoration: none;
  transition: background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
}

.button:hover {
  color: #ffffff;
  background: var(--primary-dark);
  border-color: var(--primary-dark);
  box-shadow: 0 3px 6px rgb(20 38 27 / 15%);
}

.button-secondary {
  color: var(--ink);
  background: var(--surface);
  border-color: #bfc7c1;
}

.button-secondary:hover {
  color: var(--ink);
  background: #f1f3f1;
  border-color: #9ca79f;
}

.example-card {
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.example-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 16px;
  background: #fafbf9;
  border-bottom: 1px solid var(--border);
}

.window-dots {
  display: flex;
  gap: 5px;
}

.window-dots span {
  width: 8px;
  height: 8px;
  background: #cbd2cd;
  border-radius: 50%;
}

.protocol {
  color: var(--muted);
  font-family: "Pixeloid Mono", monospace;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.045em;
  text-transform: uppercase;
}

.example-body {
  padding: 24px;
}

.example-block + .example-block {
  padding-top: 20px;
  margin-top: 20px;
  border-top: 1px solid var(--border);
}

.example-label {
  display: block;
  margin-bottom: 7px;
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.server-address,
.claim-value {
  display: block;
  overflow-wrap: anywhere;
  color: var(--ink);
  font-family: "Pixeloid Mono", monospace;
}

.server-address {
  font-size: 1.08rem;
  font-weight: 700;
}

.claim-value {
  padding: 12px;
  color: #d9e8dd;
  background: var(--dark);
  border-radius: var(--radius);
  font-size: 0.78rem;
  line-height: 1.55;
  white-space: pre-wrap;
}

.how-it-works {
  padding: 64px 0;
}

.section-heading {
  margin-bottom: 28px;
  font-size: 1.7rem;
  letter-spacing: -0.015em;
}

.step-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  padding: 0;
  margin: 0;
  list-style: none;
  counter-reset: steps;
}

.step-card {
  min-height: 220px;
  padding: 24px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  counter-increment: steps;
}

.step-card::before {
  display: block;
  margin-bottom: 28px;
  color: var(--primary);
  content: "0" counter(steps);
  font-family: "Pixeloid Mono", monospace;
  font-size: 0.78rem;
  font-weight: 700;
}

.step-card h3 {
  margin-bottom: 9px;
  font-size: 1.08rem;
}

.step-card p {
  margin-bottom: 0;
  color: var(--muted);
  font-size: 0.93rem;
}

.summary {
  margin-bottom: 64px;
  padding: 28px 32px;
  background: var(--primary-light);
  border: 1px solid #cce2d4;
  border-left: 4px solid var(--primary);
  border-radius: var(--radius);
}

.summary h2 {
  margin-bottom: 6px;
  font-size: 1.15rem;
}

.summary p {
  max-width: 760px;
  margin-bottom: 0;
  color: #405b4a;
}

.footer {
  padding: 30px 0;
  color: #bdc8c0;
  background: var(--dark);
  font-size: 0.82rem;
}

.footer .container {
  display: flex;
  justify-content: space-between;
  gap: 24px;
}

.footer p {
  margin-bottom: 0;
}

@media (max-width: 820px) {
  .hero {
    padding: 52px 0;
  }

  .hero-grid {
    grid-template-columns: 1fr;
    gap: 40px;
  }

  .step-grid {
    grid-template-columns: 1fr;
  }

  .step-card {
    min-height: 0;
  }
}

@media (max-width: 560px) {
  .navigation {
    gap: 14px;
  }

  .navigation a {
    font-size: 0.8rem;
  }

  .hero {
    padding: 40px 0;
  }

  .example-body,
  .step-card {
    padding: 20px;
  }

  .footer .container {
    display: block;
  }

  .footer p + p {
    margin-top: 6px;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    transition-duration: 0.01ms !important;
  }
}
`;
