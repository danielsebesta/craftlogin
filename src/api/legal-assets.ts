import { uiBaseStyles } from './ui/base.js';
import { uiControlStyles } from './ui/controls.js';

const legalPageStyles = `
.legal-page {
  max-width: 44rem;
  margin-inline: auto;
}

.legal-page .section-intro {
  color: var(--muted);
}

.legal-updated {
  margin-top: var(--s2);
  color: var(--muted);
  font-size: var(--t-xs);
}

.legal-section {
  margin-top: var(--s6);
}

.legal-section h2 {
  font-size: var(--t-lg);
}

.legal-section p {
  line-height: 1.6;
}

.legal-list {
  padding-left: 1.25rem;
  line-height: 1.6;
}

.legal-list li {
  margin-block: var(--s2);
}
`;

export const legalStyles = `${uiBaseStyles}${uiControlStyles}${legalPageStyles}`;
