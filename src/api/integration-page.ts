import { english } from '../locales/en.js';
import { escapeHtml } from './html.js';
import {
  createIntegrationPrompt,
  type IntegrationClientType,
  type IntegrationStack,
} from './integration-prompt.js';
import { renderPageDocument } from './ui/document.js';

export interface IntegrationPageInput {
  readonly clientId: string;
  readonly clientType: IntegrationClientType;
  readonly issuer: string;
  readonly postLogoutRedirectUri: string;
  readonly redirectUri: string;
  readonly stack: IntegrationStack;
}

const stackOptions: readonly IntegrationStack[] = [
  'generic',
  'nextjs',
  'node',
  'python',
  'php',
  'spa',
];

export function renderIntegrationPage(input: IntegrationPageInput): string {
  const strings = english.integration;
  const prompt = createIntegrationPrompt(input);
  const stackLabels = strings.fields.stacks;

  return renderPageDocument({
    content: `      <section class="landing-hero integration-hero" aria-labelledby="integration-heading">
        <h1 id="integration-heading">${escapeHtml(strings.heading)}</h1>
        <p class="landing-lead">${escapeHtml(strings.intro)}</p>
        <p class="notice">${escapeHtml(strings.affiliation)}</p>
      </section>
      <section class="landing-section" aria-labelledby="configuration-heading">
        <h2 id="configuration-heading">${escapeHtml(strings.securityHeading)}</h2>
        <ul class="use-list">${strings.securityItems.map((item): string => `<li><p>${escapeHtml(item)}</p></li>`).join('')}</ul>
        <form class="integration-form" action="/docs/integrations/ai" method="get">
          <div class="field">
            <label for="integration-stack">${escapeHtml(strings.fields.framework)}</label>
            <select id="integration-stack" name="stack">${stackOptions.map((stack): string => `<option value="${stack}"${stack === input.stack ? ' selected' : ''}>${escapeHtml(stackLabels[stack])}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label for="integration-client-type">${escapeHtml(strings.fields.clientType)}</label>
            <select id="integration-client-type" name="clientType">
              <option value="confidential"${input.clientType === 'confidential' ? ' selected' : ''}>${escapeHtml(strings.fields.confidential)}</option>
              <option value="public"${input.clientType === 'public' ? ' selected' : ''}>${escapeHtml(strings.fields.public)}</option>
            </select>
          </div>
          ${renderTextField('issuer', strings.fields.issuer, input.issuer, 'url')}
          ${renderTextField('clientId', strings.fields.clientId, input.clientId, 'text', strings.fields.clientIdHint)}
          ${renderTextField('redirectUri', strings.fields.redirectUri, input.redirectUri, 'url')}
          ${renderTextField('postLogoutRedirectUri', strings.fields.postLogoutRedirectUri, input.postLogoutRedirectUri, 'url')}
          <button class="button" type="submit">${escapeHtml(strings.generate)}</button>
        </form>
      </section>
      <section class="landing-section" aria-labelledby="prompt-heading">
        <h2 id="prompt-heading">${escapeHtml(strings.promptHeading)}</h2>
        <p class="section-intro">${escapeHtml(strings.promptHint)}</p>
        <button class="button button-secondary" type="button" data-copy-target="#integration-prompt" data-copied-label="${escapeHtml(strings.copied)}">${escapeHtml(strings.copyPrompt)}</button>
        <pre id="integration-prompt" class="code-block integration-prompt" tabindex="0"><code>${escapeHtml(prompt)}</code></pre>
      </section>`,
    description: strings.intro,
    footer: [strings.footer],
    header: {
      brand: 'CraftLogin',
      brandHref: '/',
      navigation: {
        items: [
          { href: '/developers', label: english.landing.navigation.developers },
          { href: '/.well-known/openid-configuration', label: strings.navigation.discovery },
          { href: '/llms-full.txt', label: strings.navigation.llmGuide },
        ],
        label: strings.navigationLabel,
      },
    },
    mainClass: 'container',
    script: '/assets/integration.js',
    stylesheet: '/assets/landing.css',
    title: `${strings.title} · CraftLogin`,
  });
}

function renderTextField(
  name: string,
  label: string,
  value: string,
  type: 'text' | 'url',
  hint?: string,
): string {
  const id = `integration-${name}`;
  return `<div class="field">
            <label for="${id}">${escapeHtml(label)}</label>
            <input id="${id}" name="${name}" type="${type}" value="${escapeHtml(value)}" maxlength="2048" required>
            ${hint === undefined ? '' : `<span class="field-hint">${escapeHtml(hint)}</span>`}
          </div>`;
}
