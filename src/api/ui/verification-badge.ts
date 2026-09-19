import { escapeHtml } from '../html.js';
import { renderIcon } from './icons.js';

export type VerificationBadgeKind = 'app' | 'developer';
export type VerificationBadgeState = 'pending' | 'verified';

export interface VerificationBadgeInput {
  readonly kind: VerificationBadgeKind;
  /** Callers supply the localized label so every visible string stays in the locale resources. */
  readonly label: string;
  readonly state: VerificationBadgeState;
}

export function renderVerificationBadge(input: VerificationBadgeInput): string {
  const icon =
    input.kind === 'developer' ? 'shield' : input.state === 'verified' ? 'check' : 'clock';
  // A small status dot beside the name: sighted users get the label as a
  // hover tooltip, assistive technology reads the visually hidden label.
  return `<span class="verification-badge verification-badge-${input.state}" title="${escapeHtml(input.label)}"><span class="verification-badge-dot">${renderIcon(icon, 'verification-badge-icon')}</span><span class="visually-hidden">${escapeHtml(input.label)}</span></span>`;
}
