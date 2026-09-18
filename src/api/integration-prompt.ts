import { english } from '../locales/en.js';

export type IntegrationStack = 'generic' | 'nextjs' | 'node' | 'php' | 'python' | 'spa';
export type IntegrationClientType = 'confidential' | 'public';

export interface IntegrationPromptInput {
  readonly clientId: string;
  readonly clientType: IntegrationClientType;
  readonly issuer: string;
  readonly postLogoutRedirectUri: string;
  readonly redirectUri: string;
  readonly stack: IntegrationStack;
}

export function createIntegrationPrompt(input: IntegrationPromptInput): string {
  const strings = english.integration.prompt;
  const labels = strings.labels;
  const secretInstruction = strings.secret[input.clientType];
  const requirements = strings.requirements
    .map((requirement, index): string => `${(index + 1).toString()}. ${requirement}`)
    .join('\n');

  return `${strings.opening}

${strings.inspect}

${labels.configuration}:
- ${labels.issuer}: ${input.issuer}
- ${labels.clientId}: ${input.clientId}
- ${labels.clientType}: ${input.clientType}
- ${labels.redirectUri}: ${input.redirectUri}
- ${labels.postLogoutRedirectUri}: ${input.postLogoutRedirectUri}
- ${labels.discovery}: ${input.issuer}/.well-known/openid-configuration

${labels.secretRule}: ${secretInstruction}

${labels.protocolRequirements}:
${requirements}

${labels.stackRequirements}:
${strings.stackSupplements[input.stack]}

${strings.implement}

${strings.tests}

${strings.finish}`;
}
