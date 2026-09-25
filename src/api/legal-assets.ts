import { uiBaseStyles } from './ui/base.js';
import { uiControlStyles } from './ui/controls.js';

const legalPageStyles = `
.legal-page {
  max-width: var(--reading-width);
  margin-inline: auto;
}

.legal-page > h1 {
  margin-bottom: var(--s3);
}

.legal-updated {
  margin-top: var(--s2);
  color: var(--muted);
  font-size: var(--t-xs);
}

.legal-section {
  display: grid;
  gap: var(--s3);
  margin-top: var(--s6);
}

.legal-list {
  padding-left: 1.25rem;
}

.legal-list li {
  margin-block: var(--s2);
}
`;

export const legalStyles = `${uiBaseStyles}${uiControlStyles}${legalPageStyles}`;
