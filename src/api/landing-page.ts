import { english } from '../locales/en.js';
import { escapeHtml } from './html.js';
import { highlightCode } from './ui/code-highlight.js';
import { renderPageDocument } from './ui/document.js';
import { renderIcon, type IconName } from './ui/icons.js';
import { DEMO_PLAYER, formatShowcaseCaption, type DemoPlayer } from './demo-players.js';
import { siteFooter, siteHeader } from './ui/site-chrome.js';

const SOURCE_URL = 'https://github.com/danielsebesta/craftlogin';

export interface LandingPageInput {
  readonly demoPlayer?: DemoPlayer;
  readonly showDocumentation: boolean;
}

interface Section {
  readonly body: string;
  readonly icon: IconName;
  readonly id: string;
  readonly intro?: string;
  readonly title: string;
}

const FLOW_ICONS = ['login', 'gamepad', 'user'] as const;
const USE_CASE_ICONS = ['shield', 'briefcase', 'users'] as const;

function renderSteps(): string {
  return english.landing.flow.items
    .map(
      (item, index): string => `
            <li class="card landing-card">
              ${renderIcon(FLOW_ICONS[index] ?? 'check', 'list-icon')}
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.detail)}</p>
            </li>`,
    )
    .join('');
}

function renderPlayerCard(demoPlayer: DemoPlayer): string {
  const strings = english.landing;
  return `<div class="card player-card">
            <div class="player-card-head">
              <img src="/api/avatars/${demoPlayer.uuid}/bust" alt="${escapeHtml(strings.avatars.exampleAlt)}" width="128" height="128" loading="lazy" decoding="async">
              <div class="player-card-identity">
                <span class="player-name">${escapeHtml(demoPlayer.name)}</span>
                <code class="player-uuid">${escapeHtml(demoPlayer.uuid)}</code>
                <span class="player-verified">${renderIcon('check', 'list-icon')}${escapeHtml(strings.claims.verifiedLabel)}</span>
              </div>
            </div>
            <dl class="claim-list">
              ${strings.claims.rows
                .map(
                  (row): string => `<div class="claim-row">
                <dt><code>${escapeHtml(row.claim)}</code></dt>
                <dd>${escapeHtml(row.detail)}</dd>
              </div>`,
                )
                .join('\n              ')}
            </dl>
          </div>`;
}

export function renderLandingPage(input: LandingPageInput): string {
  const strings = english.landing;
  const claims = strings.claims;
  const demoPlayer = input.demoPlayer ?? DEMO_PLAYER;

  const secondaryAction = input.showDocumentation
    ? `<a class="button button-secondary" href="/docs/">${renderIcon('bookOpen', 'button-icon')}${escapeHtml(strings.hero.documentationAction)}</a>`
    : `<a class="button button-secondary" href="${SOURCE_URL}">${renderIcon('externalLink', 'button-icon')}${escapeHtml(strings.hero.githubAction)}</a>`;

  const sections: readonly Section[] = [
    {
      body: `<ol class="landing-steps card-grid">${renderSteps()}
          </ol>`,
      icon: 'login',
      id: 'flow',
      title: strings.flow.heading,
    },
    {
      body: `<ul class="use-list card-grid">${strings.useCases.items
        .map(
          (item, index): string => `
            <li class="card landing-card">
              ${renderIcon(USE_CASE_ICONS[index] ?? 'check', 'list-icon')}
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.detail)}</p>
            </li>`,
        )
        .join('')}
          </ul>`,
      icon: 'users',
      id: 'uses',
      title: strings.useCases.heading,
    },
    {
      body: `${renderPlayerCard(demoPlayer)}
          <h3 class="chips-label">${escapeHtml(claims.scopesHeading)}</h3>
          <ul class="scope-chips">
            ${claims.scopes
              .map(
                (scope): string =>
                  `<li><code>${escapeHtml(scope.name)}</code><span class="muted">${escapeHtml(scope.detail)}</span></li>`,
              )
              .join('\n            ')}
          </ul>`,
      icon: 'user',
      id: 'claims',
      intro: claims.text,
      title: claims.heading,
    },
    {
      body: `<form class="avatar-lookup" data-avatar-lookup>
            <label class="field-label" for="avatar-lookup-input">${escapeHtml(strings.avatars.lookupLabel)}</label>
            <div class="input-action-row avatar-lookup-row">
              <input id="avatar-lookup-input" name="player" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="64" placeholder="${escapeHtml(demoPlayer.name)}">
              <button class="button" type="submit">${escapeHtml(strings.avatars.lookupAction)}</button>
            </div>
          </form>
          <ul class="avatar-showcase">
            ${[
              { label: strings.avatars.face, view: 'face' },
              { label: strings.avatars.bust, view: 'bust' },
              { label: strings.avatars.body, view: 'body' },
            ]
              .map(
                (item): string => `<li class="card card-compact avatar-card">
              <img src="/api/avatars/${demoPlayer.uuid}/${item.view}" alt="${escapeHtml(strings.avatars.exampleAlt)}: ${escapeHtml(item.label)}" width="128" height="128" loading="lazy" decoding="async" data-avatar-view="${item.view}">
              <h3>${escapeHtml(item.label)}</h3>
              <code>/api/avatars/:identifier/${item.view}</code>
            </li>`,
              )
              .join('\n            ')}
          </ul>
          <p class="avatar-credit" data-avatar-caption data-caption-template="${escapeHtml(strings.avatars.showcaseCaption)}">${escapeHtml(formatShowcaseCaption(strings.avatars.showcaseCaption, demoPlayer))}</p>
          <p class="avatar-credit" data-avatar-status hidden>${escapeHtml(strings.avatars.lookupEmpty)}</p>`,
      icon: 'gamepad',
      id: 'avatars',
      intro: strings.avatars.text,
      title: strings.avatars.heading,
    },
    {
      body: '',
      icon: 'shield',
      id: 'security',
      intro: strings.security.text,
      title: strings.security.heading,
    },
    {
      body: `<ul class="start-list card-grid">
            <li class="card landing-card start-card">
              ${renderIcon('key', 'list-icon')}
              <h3>${escapeHtml(strings.getStarted.console.title)}</h3>
              <p>${escapeHtml(strings.getStarted.console.detail)}</p>
              <a class="button" href="/developers">${escapeHtml(strings.getStarted.console.action)}</a>
            </li>
            <li class="card landing-card start-card">
              ${renderIcon('bookOpen', 'list-icon')}
              <h3>${escapeHtml(strings.getStarted.docs.title)}</h3>
              <p>${escapeHtml(strings.getStarted.docs.detail)}</p>
              <a class="button button-secondary" href="/docs/">${escapeHtml(strings.getStarted.docs.action)}</a>
            </li>
            <li class="card landing-card start-card" id="implement-with-ai">
              ${renderIcon('sparkles', 'list-icon')}
              <h3 id="implement-with-ai-heading">${escapeHtml(strings.aiPrompt.heading)}</h3>
              <p>${escapeHtml(strings.aiPrompt.text)}</p>
              <details class="prompt-details">
                <summary>${escapeHtml(strings.aiPrompt.preview)}</summary>
                <pre id="craftlogin-agent-prompt" class="code-block" tabindex="0"><code>${highlightCode(strings.aiPrompt.prompt)}</code></pre>
              </details>
              <button class="button button-secondary" type="button" data-copy-target="#craftlogin-agent-prompt" data-copied-label="${escapeHtml(strings.aiPrompt.copied)}">${escapeHtml(strings.aiPrompt.copy)}</button>
            </li>
          </ul>`,
      icon: 'sparkles',
      id: 'get-started',
      intro: strings.getStarted.intro,
      title: strings.getStarted.heading,
    },
  ];

  return renderPageDocument({
    content: `      <section class="landing-hero" aria-labelledby="hero-heading">
        <h1 id="hero-heading">${escapeHtml(strings.hero.heading)}</h1>
        <p class="landing-lead">${escapeHtml(strings.hero.lead)}</p>
        <div class="button-row landing-actions">
          <a class="button" href="/developers">${renderIcon('key', 'button-icon')}${escapeHtml(strings.hero.consoleAction)}</a>
          ${secondaryAction}
        </div>
      </section>
${sections
  .map(
    (section): string => `
      <section class="landing-section" aria-labelledby="${section.id}-heading">
        <h2 class="icon-heading" id="${section.id}-heading">${renderIcon(section.icon, 'heading-icon')}${escapeHtml(section.title)}</h2>
        ${section.intro === undefined ? '' : `<p class="section-intro">${escapeHtml(section.intro)}</p>`}
        ${section.body}
      </section>`,
  )
  .join('')}`,
    description: strings.hero.lead,
    footer: siteFooter(),
    header: siteHeader('/'),
    mainClass: 'container',
    script: ['/assets/prompt-copy.js', '/assets/avatar-lookup.js'],
    stylesheet: '/assets/landing.css',
    title: `${strings.navigation.brand} · ${strings.hero.heading}`,
  });
}
