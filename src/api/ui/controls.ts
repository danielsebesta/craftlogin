export const uiControlStyles = `
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s2);
  min-height: 2.75rem;
  padding: 0.5rem 1rem;
  color: var(--control-ink);
  text-align: center;
  text-decoration: none;
  background: var(--control);
  border: 2px solid var(--control);
  border-radius: 0;
  cursor: pointer;
  transition:
    background-color 120ms ease-out,
    border-color 120ms ease-out,
    color 120ms ease-out;
}

.button:hover {
  color: var(--control-ink);
  background: var(--control-strong);
  border-color: var(--control-strong);
}

.button:active {
  background: var(--control);
  border-color: var(--control);
}

.button-secondary {
  color: var(--text);
  background: transparent;
  border-color: var(--line-strong);
}

.button-secondary:hover {
  color: var(--text);
  background: var(--surface-raised);
  border-color: var(--accent);
}

.button-secondary:active {
  background: var(--surface);
}

.button-danger {
  color: var(--danger-strong);
  background: transparent;
  border-color: var(--danger);
}

.button-danger:hover {
  color: var(--bg);
  background: var(--danger);
  border-color: var(--danger);
}

.button-quiet {
  min-height: 2.75rem;
  padding-inline: var(--s2);
  color: var(--muted);
  background: transparent;
  border-color: transparent;
}

.button-quiet:hover {
  color: var(--text);
  background: var(--surface-raised);
}

/* Row-level destructive navigation stays quiet until it is pointed at. */
.table-actions .button-quiet:hover {
  color: var(--danger-strong);
}

.button:disabled,
.button[aria-disabled="true"] {
  cursor: not-allowed;
  opacity: 0.55;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s3);
  align-items: center;
}

.field {
  display: grid;
  gap: var(--s2);
}

.field > label,
.field-label {
  font-size: var(--t-sm);
  font-weight: 700;
}

.field-hint {
  color: var(--muted);
  font-size: var(--t-xs);
}

.field-error {
  color: var(--danger-strong);
  font-size: var(--t-xs);
  font-weight: 700;
}

fieldset {
  padding: 0;
  margin: 0;
  min-inline-size: 0;
  border: 0;
}

legend {
  padding: 0;
}

input:not([type="radio"]):not([type="checkbox"]),
select,
textarea {
  width: 100%;
  min-height: 2.75rem;
  padding: 0.5rem 0.75rem;
  color: var(--text);
  background: var(--surface-raised);
  border: 2px solid var(--line-strong);
  border-radius: 0;
}

textarea {
  min-height: 7rem;
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  resize: vertical;
}

input:not([type="radio"]):not([type="checkbox"]):hover,
select:hover,
textarea:hover {
  border-color: var(--accent);
}

input:not([type="radio"]):not([type="checkbox"]):focus-visible,
select:focus-visible,
textarea:focus-visible {
  border-color: var(--accent);
}

input:not([type="radio"]):not([type="checkbox"])[aria-invalid="true"],
select[aria-invalid="true"],
textarea[aria-invalid="true"] {
  border-color: var(--danger);
}

.choice-group {
  display: grid;
}

.choice {
  display: grid;
  grid-template-columns: 1.5rem 1fr;
  gap: var(--s3);
  align-items: start;
  padding: var(--s3) var(--s4);
  border: 2px solid var(--line-strong);
  cursor: pointer;
}

.choice + .choice {
  margin-top: -2px;
}

.choice:hover {
  border-color: var(--accent);
}

.choice input {
  width: 1.25rem;
  min-height: 1.25rem;
  margin: 0.2rem 0 0;
  accent-color: var(--accent);
}

.choice-title {
  display: block;
  font-weight: 700;
}

.choice-hint {
  display: block;
  color: var(--muted);
  font-size: var(--t-xs);
}

.table-wrap {
  position: relative;
  overflow-x: auto;
}

.table {
  width: 100%;
  font-size: var(--t-sm);
  border-collapse: collapse;
}

.table th,
.table td {
  padding: var(--s3);
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--line);
}

.table th {
  color: var(--muted);
  font-size: var(--t-xs);
  font-weight: 700;
}

.table th:first-child,
.table td:first-child {
  padding-left: 0;
}

.table th:last-child,
.table td:last-child {
  padding-right: 0;
}

.table tbody tr:hover > * {
  background: var(--surface-raised);
}

.table tbody tr:last-child > * {
  border-bottom: 0;
}

.table-actions {
  text-align: right;
}

.table code {
  overflow-wrap: anywhere;
}

.disclosure {
  border-top: 1px solid var(--line);
}

.disclosure summary {
  display: flex;
  gap: var(--s3);
  align-items: center;
  justify-content: space-between;
  min-height: 2.75rem;
  padding: var(--s4) 0;
  font-size: var(--t-lg);
  font-weight: 700;
  cursor: pointer;
  list-style: none;
}

.disclosure summary::-webkit-details-marker {
  display: none;
}

.disclosure summary:hover {
  color: var(--accent);
}

.disclosure-marker {
  color: var(--muted);
  font-family: var(--font-mono);
}

.disclosure-marker::before {
  content: "+";
}

.disclosure[open] .disclosure-marker::before {
  content: "\\2212";
}

.disclosure-body {
  padding-bottom: var(--s6);
}

.notice {
  padding: var(--s3) var(--s4);
  background: var(--surface-raised);
  border: 2px solid var(--line);
}

.notice-error {
  color: var(--danger-strong);
  border-color: var(--danger);
}

.empty-state {
  max-width: var(--measure);
  padding: var(--s5) 0;
  color: var(--muted);
}

.code-block {
  display: block;
  padding: var(--s4);
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  line-height: 1.6;
  color: var(--text);
  white-space: pre;
  background: var(--surface-raised);
  border: 2px solid var(--line);
  border-radius: 0;
}

.card {
  padding: var(--s5);
  background: var(--surface);
  border: 2px solid var(--line);
}

.section {
  padding-block: var(--s7);
}

.section + .section {
  border-top: 1px solid var(--line);
}

.stack {
  display: grid;
  gap: var(--s4);
}

.stack-tight {
  display: grid;
  gap: var(--s2);
}

.cluster {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s3);
  align-items: center;
}

.steps {
  display: grid;
  gap: var(--s3);
  padding-left: var(--s5);
  color: var(--muted);
}

.steps li::marker {
  color: var(--muted);
  font-family: var(--font-mono);
}

.lead {
  max-width: var(--measure);
  color: var(--muted);
}

.mono {
  overflow-wrap: anywhere;
  font-family: var(--font-mono);
}

.summary-list {
  display: grid;
  gap: var(--s3);
  margin: 0;
}

.summary-list > div {
  display: grid;
  grid-template-columns: 10rem minmax(0, 1fr);
  gap: var(--s3);
}

.summary-list dt {
  font-size: var(--t-xs);
  font-weight: 700;
  color: var(--muted);
}

.summary-list dd {
  margin: 0;
}

.summary-list code {
  overflow-wrap: anywhere;
}

@media (max-width: 40rem) {
  .summary-list > div {
    grid-template-columns: 1fr;
    gap: var(--s1);
  }
}

.muted {
  color: var(--muted);
}
`;
