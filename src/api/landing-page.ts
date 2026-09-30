import { english } from '../locales/en.js';
import { escapeHtml } from './html.js';
import { highlightCode } from './ui/code-highlight.js';
import { renderPageDocument } from './ui/document.js';
import { renderIcon, type IconName } from './ui/icons.js';
import { DEMO_PLAYER, formatShowcaseCaption, type DemoPlayer } from './demo-players.js';
import { siteHeader } from './ui/site-chrome.js';

const SOURCE_URL = 'https://github.com/danielsebesta/craftlogin';

// Display-only sample from the verification-code alphabet; not a live session.
const DEMO_SERVER_ADDRESS = 'K7XQ2M9P.craftlogin.com';

export interface LandingPageInput {
  readonly demoPlayer?: DemoPlayer;
  readonly showDocumentation: boolean;
}

function avatarUrl(uuid: string, view: string): string {
  return `/api/avatars/${encodeURIComponent(uuid)}/${view}`;
}

function demoBar(icon: IconName, label: string, monoLabel: boolean): string {
  const text = monoLabel
    ? `<code>${escapeHtml(label)}</code>`
    : `<span>${escapeHtml(label)}</span>`;
  return `<div class="demo-bar">${renderIcon(icon)}${text}</div>`;
}

function demoWindow(inner: string, game = false): string {
  return `<div class="demo-window${game ? ' demo-window-game' : ''}" aria-hidden="true"><div class="demo-window-inner">${inner}</div></div>`;
}

// The middle window is a decorative auto-cycling demo of the three
// verification methods the interaction page offers. Only the first panel
// ships data-active; the script rotates it, and without JS the server scene
// is what every visitor sees.
function renderMethodDemo(demoPlayer: DemoPlayer): string {
  const demo = english.landing.demo;

  return `<div class="demo-window" aria-hidden="true"><div class="demo-window-inner" data-method-demo>
          <div class="method-panels">
            <div class="method-panel method-panel-game" data-method-panel="server" data-active>
              ${demoBar('gamepad', demo.gameTitle, false)}
              <div class="demo-body">
                <span class="demo-label">${escapeHtml(demo.addressLabel)}</span>
                <span class="demo-field"><span class="demo-typed">${escapeHtml(DEMO_SERVER_ADDRESS)}</span></span>
                <span class="demo-button demo-button-secondary">${escapeHtml(demo.joinButton)}</span>
              </div>
            </div>
            <div class="method-panel" data-method-panel="skin">
              ${demoBar('lock', demo.skinBar, true)}
              <div class="demo-body">
                <div class="demo-skin">
                  <img class="demo-skin-face" src="${escapeHtml(avatarUrl(demoPlayer.uuid, 'face'))}" alt="" width="40" height="40" loading="lazy" decoding="async">
                  <span class="demo-label">${escapeHtml(demo.skinLabel)}</span>
                  <span class="demo-button demo-button-secondary">${escapeHtml(demo.skinUpload)}</span>
                </div>
                <p class="demo-hint">${escapeHtml(demo.skinHint)}</p>
              </div>
            </div>
            <div class="method-panel" data-method-panel="microsoft">
              ${demoBar('lock', demo.microsoftBar, true)}
              <div class="demo-body">
                <span class="demo-label">${escapeHtml(demo.microsoftLabel)}</span>
                <span class="demo-button">${renderIcon('microsoft')}${escapeHtml(demo.microsoftButton)}</span>
                <p class="demo-hint">${escapeHtml(demo.microsoftHint)}</p>
              </div>
            </div>
          </div>
        </div></div>`;
}

function renderHandoff(demoPlayer: DemoPlayer): string {
  const strings = english.landing;
  const steps = [
    {
      copy: strings.flow.send,
      window: demoWindow(
        `${demoBar('lock', strings.demo.siteAddress, true)}
        <div class="demo-body">
          <span class="demo-button"><img src="/favicon-96x96.png" alt="" width="24" height="24" decoding="async">${escapeHtml(strings.demo.signInButton)}</span>
        </div>`,
      ),
    },
    {
      copy: strings.flow.prove,
      window: renderMethodDemo(demoPlayer),
    },
    {
      copy: strings.flow.receive,
      window: demoWindow(
        `${demoBar('lock', strings.demo.siteAddress, true)}
        <div class="demo-body">
          <div class="demo-result">
            <div class="demo-result-row">
              <img class="demo-result-face" src="${escapeHtml(avatarUrl(demoPlayer.uuid, 'face'))}" alt="" width="40" height="40" loading="lazy" decoding="async">
              <strong>${escapeHtml(demoPlayer.name)}</strong>
              <span class="demo-result-status">${renderIcon('check')}${escapeHtml(strings.demo.signedIn)}</span>
            </div>
            <code class="demo-result-sub">sub ${escapeHtml(demoPlayer.uuid)}</code>
          </div>
        </div>`,
      ),
    },
  ];

  return `<ol class="handoff">
          ${steps
            .map(
              (step, index): string => `<li class="handoff-step">
              <div class="handoff-visual">${index === 0 ? '' : renderIcon('arrowRight', 'ui-icon handoff-arrow')}${step.window}</div>
              <div class="handoff-copy">
                <h3>${escapeHtml(step.copy.title)}</h3>
                <p>${escapeHtml(step.copy.detail)}</p>
              </div>
            </li>`,
            )
            .join('\n          ')}
        </ol>`;
}

function renderUseCases(demoPlayer: DemoPlayer): string {
  const strings = english.landing.useCases;
  const face = `<img class="use-face" src="${escapeHtml(avatarUrl(demoPlayer.uuid, 'face'))}" alt="" width="24" height="24" loading="lazy" decoding="async">`;
  const rows = [
    {
      copy: strings.roles,
      example: `<div class="use-line">${face}<strong>${escapeHtml(demoPlayer.name)}</strong>${strings.roles.tags
        .map((tag): string => `<span class="use-tag">${escapeHtml(tag)}</span>`)
        .join('')}</div>`,
    },
    {
      copy: strings.vip,
      example: `<p><strong>${escapeHtml(strings.vip.product)}</strong></p>
            <p class="use-status">${renderIcon('check')}${escapeHtml(strings.vip.delivered.replaceAll('{player}', demoPlayer.name))}</p>`,
    },
    {
      copy: strings.comments,
      example: `<div class="use-line">${face}<strong>${escapeHtml(demoPlayer.name)}</strong><span class="use-time">${escapeHtml(strings.comments.time)}</span></div>
            <p class="use-message">${escapeHtml(strings.comments.message)}</p>`,
    },
  ];

  return `<section class="landing-section landing-split" aria-labelledby="uses-heading">
      <div class="section-head">
        <h2 id="uses-heading">${escapeHtml(strings.heading)}</h2>
      </div>
      <ul class="use-rows">
        ${rows
          .map(
            (row): string => `<li class="use-row">
          <div class="use-copy">
            <h3>${escapeHtml(row.copy.title)}</h3>
            <p>${escapeHtml(row.copy.detail)}</p>
          </div>
          <div class="card card-compact use-example" aria-hidden="true">
            ${row.example}
          </div>
        </li>`,
          )
          .join('\n        ')}
      </ul>
    </section>`;
}

function renderClaims(demoPlayer: DemoPlayer): string {
  const strings = english.landing.claims;
  const values = [
    demoPlayer.uuid,
    demoPlayer.name,
    `https://craftlogin.com/avatar/${demoPlayer.uuid}`,
  ];

  return `<section class="landing-section" aria-labelledby="claims-heading">
      <div class="section-head">
        <h2 id="claims-heading">${escapeHtml(strings.heading)}</h2>
        <p>${escapeHtml(strings.text)}</p>
      </div>
      <div class="card card-flush identity">
        <div class="identity-player">
          <img class="identity-avatar" src="${escapeHtml(avatarUrl(demoPlayer.uuid, 'bust'))}" alt="" width="128" height="128" loading="lazy" decoding="async">
          <p class="identity-name">${escapeHtml(demoPlayer.name)}</p>
          <p class="identity-verified">${renderIcon('check')}${escapeHtml(strings.verifiedLabel)}</p>
        </div>
        <div class="payload-frame">
          <span class="payload-brace" aria-hidden="true">{</span>
          <dl class="payload">
            ${strings.rows
              .map((row, index): string => {
                const comma = index < strings.rows.length - 1 ? ',' : '';
                const line = `"${row.claim}": "${values[index] ?? ''}"${comma}`;
                return `<div class="payload-row">
              <dt><code>${highlightCode(line)}</code><span class="payload-scope"><span class="visually-hidden">${escapeHtml(strings.scopeLabel)} </span>${escapeHtml(row.scope)}</span></dt>
              <dd>${escapeHtml(row.detail)}</dd>
            </div>`;
              })
              .join('\n            ')}
          </dl>
          <span class="payload-brace" aria-hidden="true">}</span>
        </div>
      </div>
    </section>`;
}

function renderAvatars(demoPlayer: DemoPlayer): string {
  const strings = english.landing.avatars;
  const views = [
    { label: strings.face, name: 'face' },
    { label: strings.bust, name: 'bust' },
    { label: strings.body, name: 'body' },
    { label: strings.side, name: 'side' },
    { label: strings.back, name: 'back' },
    { label: strings.wings, name: 'wings' },
  ] as const;

  return `<section class="landing-section landing-split" aria-labelledby="avatars-heading">
      <div class="section-head">
        <h2 id="avatars-heading">${escapeHtml(strings.heading)}</h2>
        <p>${escapeHtml(strings.text)}</p>
      </div>
      <div class="card card-flush bench">
        <form class="bench-form" data-avatar-lookup>
          <label class="field-label" for="avatar-lookup-input">${escapeHtml(strings.lookupLabel)}</label>
          <div class="bench-url">
            <div class="bench-field">
              <span class="bench-path" aria-hidden="true">/api/avatars/</span><input id="avatar-lookup-input" name="player" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="64" placeholder="${escapeHtml(demoPlayer.name)}">
            </div>
            <button class="button" type="submit">${escapeHtml(strings.lookupAction)}</button>
          </div>
        </form>
        <ul class="bench-stage">
          ${views
            .map(
              (view): string => `<li class="bench-view">
            <img src="${escapeHtml(avatarUrl(demoPlayer.uuid, view.name))}" alt="${escapeHtml(strings.exampleAlt)}: ${escapeHtml(view.label)}" width="128" height="128" loading="lazy" decoding="async" data-avatar-view="${view.name}">
            <code>${view.name}</code>
          </li>`,
            )
            .join('\n          ')}
        </ul>
        <p class="avatar-credit" aria-live="polite" data-avatar-caption data-caption-template="${escapeHtml(strings.showcaseCaption)}">${escapeHtml(formatShowcaseCaption(strings.showcaseCaption, demoPlayer))}</p>
        <p class="avatar-credit" data-avatar-status hidden>${escapeHtml(strings.lookupEmpty)}</p>
      </div>
    </section>`;
}

function renderSecurity(): string {
  const strings = english.landing.security;
  const column = (
    items: readonly string[],
    icon: IconName,
    heading: string,
    modifier = '',
  ): string => `<div class="ledger-column${modifier}">
        <h3>${escapeHtml(heading)}</h3>
        <ul class="ledger-list">
          ${items
            .map(
              (item): string =>
                `<li>${renderIcon(icon, 'ui-icon ledger-icon')}${escapeHtml(item)}</li>`,
            )
            .join('\n          ')}
        </ul>
      </div>`;

  return `<section class="landing-section landing-split" aria-labelledby="security-heading">
      <div class="section-head">
        <h2 id="security-heading">${escapeHtml(strings.heading)}</h2>
        <p>${escapeHtml(strings.text)}</p>
        <a href="/privacy">${escapeHtml(strings.privacyAction)}</a>
      </div>
      <div class="ledger">
        ${column(strings.stored.items, 'check', strings.stored.heading)}
        ${column(strings.neverStored.items, 'close', strings.neverStored.heading, ' ledger-never')}
      </div>
    </section>`;
}

function renderGetStarted(): string {
  const strings = english.landing.getStarted;
  const promptStrings = english.landing.aiPrompt;
  const steps = [
    { ...strings.console, href: '/developers', primary: true },
    { ...strings.docs, href: '/docs/', primary: false },
  ];

  return `<section class="landing-section" aria-labelledby="get-started-heading">
      <div class="card start-band">
        <div class="section-head">
          <h2 id="get-started-heading">${escapeHtml(strings.heading)}</h2>
          <p>${escapeHtml(strings.intro)}</p>
        </div>
        <div class="start-grid">
          <ol class="start-steps">
            ${steps
              .map(
                (step): string => `<li>
              <h3>${escapeHtml(step.title)}</h3>
              <p>${escapeHtml(step.detail)}</p>
              <a class="button${step.primary ? '' : ' button-secondary'}" href="${escapeHtml(step.href)}">${escapeHtml(step.action)}</a>
            </li>`,
              )
              .join('\n            ')}
          </ol>
          <div class="agent" id="implement-with-ai">
            <h3 id="implement-with-ai-heading">${escapeHtml(promptStrings.heading)}</h3>
            <p>${escapeHtml(promptStrings.text)}</p>
            <pre id="craftlogin-agent-prompt" class="code-block" tabindex="0" aria-labelledby="implement-with-ai-heading"><code>${highlightCode(promptStrings.prompt)}</code></pre>
            <button class="button button-secondary" type="button" data-copy-target="#craftlogin-agent-prompt" data-copied-label="${escapeHtml(promptStrings.copied)}">${escapeHtml(promptStrings.copy)}</button>
          </div>
        </div>
      </div>
    </section>`;
}

export function renderLandingPage(input: LandingPageInput): string {
  const strings = english.landing;
  const demoPlayer = input.demoPlayer ?? DEMO_PLAYER;

  const secondaryAction = input.showDocumentation
    ? `<a class="button button-secondary" href="/docs/">${renderIcon('bookOpen', 'button-icon')}${escapeHtml(strings.hero.documentationAction)}</a>`
    : `<a class="button button-secondary" href="${SOURCE_URL}">${renderIcon('externalLink', 'button-icon')}${escapeHtml(strings.hero.githubAction)}</a>`;

  return renderPageDocument({
    content: `      <section class="landing-hero" aria-labelledby="hero-heading">
        <div class="landing-hero-head">
          <h1 id="hero-heading">${escapeHtml(strings.hero.heading)}</h1>
          <div class="landing-hero-side">
            <p class="landing-lead">${escapeHtml(strings.hero.lead)}</p>
            <div class="button-row landing-actions">
              <a class="button" href="/developers">${renderIcon('key', 'button-icon')}${escapeHtml(strings.hero.consoleAction)}</a>
              ${secondaryAction}
            </div>
          </div>
        </div>
        <h2 class="visually-hidden" id="flow-heading">${escapeHtml(strings.flow.heading)}</h2>
        ${renderHandoff(demoPlayer)}
      </section>
${renderUseCases(demoPlayer)}
${renderClaims(demoPlayer)}
${renderAvatars(demoPlayer)}
${renderSecurity()}
${renderGetStarted()}`,
    description: strings.hero.lead,
    header: siteHeader('/'),
    mainClass: 'container',
    script: ['/assets/prompt-copy.js', '/assets/avatar-lookup.js', '/assets/method-switch.js'],
    stylesheet: '/assets/landing.css',
    title: `${strings.navigation.brand} · ${strings.hero.heading}`,
  });
}
