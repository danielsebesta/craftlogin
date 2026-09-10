import { fontFaceStyles } from './font-assets.js';

export const developerStyles = `${fontFaceStyles}
:root {
  color-scheme: dark;
  --night: #101814;
  --night-raised: #17221c;
  --paper: #f1eee3;
  --paper-muted: #ddd8c9;
  --ink: #162019;
  --muted: #667169;
  --line: #aca99d;
  --green: #b7e46a;
  --green-dark: #246b45;
  --amber: #f4c76d;
  --danger: #ad4439;
  --white: #f9fbf7;
  font-family: "Pixeloid Sans", sans-serif;
}

* { box-sizing: border-box; }

html { min-width: 320px; background: var(--night); }

body {
  min-height: 100vh;
  margin: 0;
  color: var(--white);
  background:
    linear-gradient(rgb(16 24 20 / 93%), rgb(16 24 20 / 98%)),
    repeating-linear-gradient(90deg, transparent 0 47px, rgb(183 228 106 / 11%) 48px),
    repeating-linear-gradient(0deg, transparent 0 47px, rgb(183 228 106 / 11%) 48px);
  line-height: 1.55;
}

button, input, select, textarea { font: inherit; }
a { color: inherit; }
code, pre { font-family: "Pixeloid Mono", monospace; }

a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
  outline: 3px solid var(--green);
  outline-offset: 3px;
}

.developer-nav, .developer-footer, .console-main, .developer-login {
  width: min(1180px, calc(100% - 32px));
  margin-inline: auto;
}

.developer-nav {
  display: flex;
  min-height: 74px;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  border-bottom: 1px solid rgb(255 255 255 / 16%);
}

.developer-brand {
  display: inline-flex;
  align-items: center;
  gap: 11px;
  font-family: "Pixeloid Sans", sans-serif;
  font-size: 1.13rem;
  font-weight: 700;
  text-decoration: none;
}

.developer-brand span {
  width: 22px;
  height: 22px;
  background: var(--green);
  border: 5px solid #315a40;
}

.developer-nav nav { display: flex; align-items: center; gap: 22px; font-size: .82rem; }
.developer-nav nav a { color: #b4bdb6; text-decoration: none; }
.developer-nav nav strong { color: var(--green); font-family: "Pixeloid Mono", monospace; text-transform: uppercase; letter-spacing: .08em; }

.developer-footer {
  min-height: 76px;
  padding-top: 22px;
  color: #98a39b;
  border-top: 1px solid rgb(255 255 255 / 13%);
  font-size: .78rem;
}

.kicker, .panel-index, .terminal-label, .role-stamp, .login-status span, .credential span, dt, label > span, legend {
  font-family: "Pixeloid Mono", monospace;
  font-size: .71rem;
  font-weight: 700;
  letter-spacing: .105em;
  text-transform: uppercase;
}

h1, h2, h3, p { margin-top: 0; }
h1, h2 { font-family: "Pixeloid Sans", sans-serif; letter-spacing: -.015em; }

.developer-login {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(360px, .95fr);
  min-height: calc(100vh - 150px);
  padding-block: clamp(32px, 7vw, 84px);
}

.login-manifest, .login-terminal { padding: clamp(34px, 6vw, 70px); }
.login-manifest { color: var(--ink); background: var(--paper); border: 1px solid var(--line); box-shadow: 14px 14px 0 rgb(0 0 0 / 28%); }
.login-manifest .kicker, .console-hero .kicker { color: var(--green-dark); }
.login-manifest h1 { max-width: 650px; margin-bottom: 26px; font-size: clamp(3rem, 7vw, 6rem); line-height: .91; }
.intro { max-width: 720px; color: var(--muted); font-size: 1.04rem; }

.login-steps { display: grid; gap: 13px; padding: 30px 0 0; margin: 30px 0 0; border-top: 1px solid var(--line); list-style: none; counter-reset: login-step; }
.login-steps li { display: grid; grid-template-columns: 30px 1fr; gap: 12px; align-items: start; counter-increment: login-step; }
.login-steps li::before { display: grid; width: 27px; height: 27px; color: #fff; background: var(--green-dark); content: counter(login-step); place-items: center; font: 700 .72rem/1 "Pixeloid Mono", monospace; }

.login-terminal { display: flex; flex-direction: column; justify-content: center; background: var(--night-raised); border: 1px solid #34453a; border-left: 0; }
.terminal-label { margin-bottom: 14px; color: var(--green); }
.login-address { overflow-wrap: anywhere; color: #fff; font: 700 clamp(1.45rem, 4vw, 2.7rem)/1.16 "Pixeloid Mono", monospace; letter-spacing: 0; }
.login-status { padding-top: 25px; margin-top: 34px; border-top: 1px solid rgb(255 255 255 / 17%); }
.login-status span { color: #a8b2aa; }
.login-status p { min-height: 48px; margin: 7px 0 0; }
.login-status p[data-state="verified"] { color: var(--green); }
.login-status p[data-state="expired"] { color: #ffaaa1; }
.login-terminal form { margin-top: 24px; }
.noscript-note { margin: 18px 0 0; color: var(--amber); font-size: .84rem; }

.primary-action, .secondary-action, .danger-action, .text-action {
  min-height: 42px;
  border-radius: 0;
  cursor: pointer;
  font-family: "Pixeloid Mono", monospace;
  font-size: .74rem;
  font-weight: 700;
  letter-spacing: .045em;
  text-transform: uppercase;
}

.primary-action { width: 100%; padding: 12px 18px; color: #112018; background: var(--green); border: 2px solid var(--green); box-shadow: 5px 5px 0 #090d0b; }
.primary-action:hover { background: #cdf28e; transform: translate(-1px, -1px); box-shadow: 7px 7px 0 #090d0b; }
.inline-action { display: inline-block; width: auto; margin-top: 14px; text-decoration: none; }
.secondary-action, .danger-action, .text-action { padding: 8px 11px; background: transparent; }
.secondary-action { color: var(--ink); border: 1px solid #858b85; }
.danger-action { color: var(--danger); border: 1px solid #ca8a84; }
.text-action { min-height: 0; padding: 0 0 2px; color: var(--ink); border: 0; border-bottom: 1px solid currentcolor; }

.console-main { padding-block: clamp(40px, 7vw, 80px); }
.console-hero { display: grid; grid-template-columns: 1fr minmax(310px, .44fr); gap: 60px; align-items: end; margin-bottom: 44px; }
.console-hero .kicker { color: var(--green); }
.console-hero h1 { max-width: 820px; margin-bottom: 18px; font-size: clamp(3rem, 7vw, 6.2rem); line-height: .9; }
.console-hero .intro { margin-bottom: 0; color: #aeb8b0; }

.identity-ticket { padding: 22px; color: var(--ink); background: var(--paper-muted); border-top: 6px solid var(--green); box-shadow: 8px 8px 0 rgb(0 0 0 / 25%); }
.identity-ticket > span:not(.role-stamp) { display: block; margin-top: 22px; color: var(--muted); font-size: .72rem; }
.identity-ticket code { display: block; margin: 5px 0 18px; overflow-wrap: anywhere; font-size: .78rem; }
.role-stamp { display: inline-block; padding: 5px 8px; color: #16321f; background: var(--green); }

.console-grid { display: grid; grid-template-columns: minmax(310px, .78fr) minmax(0, 1.22fr); gap: 22px; align-items: start; }
.panel { color: var(--ink); background: var(--paper); border: 1px solid var(--line); box-shadow: 8px 8px 0 rgb(0 0 0 / 23%); }
.app-register, .admin-panel { padding: clamp(25px, 4vw, 42px); }
.app-directory { overflow: hidden; }
.app-directory > h2, .app-directory > .panel-index { margin-inline: clamp(25px, 4vw, 42px); }
.app-directory > .panel-index { margin-top: clamp(25px, 4vw, 42px); }
.panel-index { margin-bottom: 16px; color: var(--green-dark); }
.panel h2 { margin-bottom: 28px; font-size: clamp(1.8rem, 4vw, 2.8rem); }

.stack-form { display: grid; gap: 23px; }
.stack-form label, .admin-grant-form label { display: grid; gap: 7px; }
.stack-form small, .choice-row small, .access-row small { display: block; color: var(--muted); font-size: .77rem; line-height: 1.4; }
input, textarea, select { width: 100%; color: var(--ink); background: #fffef9; border: 1px solid #989b91; border-radius: 0; }
input, select { min-height: 44px; padding: 9px 11px; }
textarea { min-height: 112px; padding: 11px; resize: vertical; font-family: "Pixeloid Mono", monospace; font-size: .82rem; }
fieldset { padding: 0; margin: 0; border: 0; }
legend { margin-bottom: 9px; }
.choice-row { display: grid; grid-template-columns: 19px 1fr; gap: 10px; padding: 11px; border: 1px solid #c2c0b6; }
.choice-row + .choice-row { border-top: 0; }
.choice-row input { width: 18px; min-height: 18px; margin: 2px 0 0; accent-color: var(--green-dark); }
.choice-row strong { display: block; font-size: .87rem; }

.app-list { border-top: 1px solid var(--line); }
.app-row { padding: 26px clamp(25px, 4vw, 42px); }
.app-row + .app-row { border-top: 1px solid var(--line); }
.app-heading { display: flex; justify-content: space-between; gap: 20px; align-items: start; }
.app-heading h3 { margin: 3px 0 18px; font-family: "Pixeloid Sans", sans-serif; font-size: 1.35rem; }
.client-type { color: var(--green-dark); font: 700 .65rem/1 "Pixeloid Mono", monospace; text-transform: uppercase; letter-spacing: .08em; }
dl { display: grid; gap: 14px; margin: 0; }
dl div { display: grid; grid-template-columns: 100px 1fr; gap: 16px; }
dt { color: var(--muted); }
dd { min-width: 0; margin: 0; }
dd code { display: block; overflow-wrap: anywhere; font-size: .77rem; }
dd code + code { margin-top: 5px; }
.empty-state { padding: 0 clamp(25px, 4vw, 42px) 34px; color: var(--muted); }

.admin-panel { margin-top: 22px; }
.admin-heading p { max-width: 760px; color: var(--muted); }
.admin-grant-form { display: grid; grid-template-columns: minmax(280px, 1fr) 210px 180px; gap: 12px; align-items: end; padding: 22px; background: var(--paper-muted); }
.access-list { margin-top: 24px; border-top: 1px solid var(--line); }
.access-row { display: grid; grid-template-columns: minmax(260px, 1fr) minmax(340px, .9fr) auto; gap: 18px; align-items: end; padding: 18px 0; border-bottom: 1px solid var(--line); }
.access-row > div code { display: block; overflow-wrap: anywhere; }
.access-row form { display: flex; gap: 9px; align-items: end; }
.compact-label { display: grid; gap: 4px; min-width: 180px; }
.notice { padding: 12px 15px; color: #4c3010; background: #fae1aa; border-left: 5px solid #b97822; }

.message-layout { display: grid; width: min(850px, calc(100% - 32px)); min-height: calc(100vh - 150px); margin-inline: auto; padding-block: 60px; place-items: center; }
.message-card { width: 100%; padding: clamp(34px, 7vw, 70px); color: var(--ink); background: var(--paper); border-top: 8px solid var(--green-dark); box-shadow: 14px 14px 0 rgb(0 0 0 / 28%); }
.message-card-denied { border-top-color: var(--danger); }
.message-card h1 { margin-bottom: 22px; font-size: clamp(2.7rem, 7vw, 5rem); line-height: .96; }
.credential { padding: 17px; margin-top: 14px; background: #fffef9; border: 1px solid var(--line); }
.credential span { display: block; margin-bottom: 7px; color: var(--muted); }
.credential code { display: block; overflow-wrap: anywhere; }
.credential-secret { color: #fff; background: var(--night-raised); border-color: #34453a; }
.credential-secret span { color: var(--green); }
.credential-card > form { margin-top: 24px; }
@media (max-width: 900px) {
  .developer-login, .console-grid, .console-hero { grid-template-columns: 1fr; }
  .developer-login { width: min(700px, calc(100% - 24px)); padding-block: 24px 42px; }
  .login-terminal { border-top: 0; border-left: 1px solid #34453a; }
  .console-hero { gap: 28px; }
  .admin-grant-form { grid-template-columns: 1fr 1fr; }
  .admin-grant-form .primary-action { grid-column: 1 / -1; }
  .access-row { grid-template-columns: 1fr; }
}

@media (max-width: 560px) {
  .developer-nav, .developer-footer, .console-main { width: calc(100% - 24px); }
  .developer-nav nav a { display: none; }
  .login-manifest, .login-terminal { padding: 32px 24px; }
  .console-main { padding-block: 36px; }
  .console-hero h1 { font-size: 3.2rem; }
  .admin-grant-form { grid-template-columns: 1fr; padding: 16px; }
  dl div { grid-template-columns: 1fr; gap: 3px; }
  .app-heading { display: block; }
  .app-heading form { margin-bottom: 16px; }
  .access-row form { align-items: stretch; flex-direction: column; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; }
}
`;
