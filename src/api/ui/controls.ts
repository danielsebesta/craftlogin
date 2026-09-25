export const uiControlStyles = `
.button {
  --button-ink: var(--control-ink);
  --button-bg: var(--control);
  --button-border: var(--control);
  --button-hover-ink: var(--control-ink);
  --button-hover-bg: var(--control-strong);
  --button-hover-border: var(--control-strong);
  --button-active-bg: var(--control);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s2);
  min-width: 0;
  max-width: 100%;
  min-height: var(--control-height);
  padding: 0.5rem 1rem;
  color: var(--button-ink);
  text-align: center;
  text-decoration: none;
  white-space: normal;
  overflow-wrap: anywhere;
  background: var(--button-bg);
  border: 2px solid var(--button-border);
  border-radius: 0;
  cursor: pointer;
  transition:
    background-color var(--motion-duration) ease-out,
    border-color var(--motion-duration) ease-out,
    color var(--motion-duration) ease-out;
}

.button:where(:not(:disabled, [aria-disabled="true"])):hover {
  color: var(--button-hover-ink);
  background: var(--button-hover-bg);
  border-color: var(--button-hover-border);
}

.button:where(:not(:disabled, [aria-disabled="true"])):active {
  color: var(--button-hover-ink);
  background: var(--button-active-bg);
  border-color: var(--button-hover-border);
}

.button-secondary {
  --button-ink: var(--text);
  --button-bg: transparent;
  --button-border: var(--line-strong);
  --button-hover-ink: var(--text);
  --button-hover-bg: var(--surface);
  --button-hover-border: var(--line-strong);
  --button-active-bg: var(--surface);
}

.button-danger {
  --button-ink: var(--danger-strong);
  --button-bg: transparent;
  --button-border: var(--danger);
  --button-hover-ink: var(--bg);
  --button-hover-bg: var(--danger);
  --button-hover-border: var(--danger);
  --button-active-bg: var(--danger-strong);
}

.button-quiet {
  --button-ink: var(--muted);
  --button-bg: transparent;
  --button-border: transparent;
  --button-hover-ink: var(--text);
  --button-hover-bg: var(--surface);
  --button-hover-border: transparent;
  --button-active-bg: var(--surface);
  padding-inline: var(--s2);
}

/* Neutral quiet actions never inherit danger styling; destructive navigation opts in. */
.button-danger-quiet {
  --button-ink: var(--danger-strong);
  --button-hover-ink: var(--danger-strong);
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

.input-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
}

.input-action-row input {
  flex: 1 1 12rem;
}

.input-action-row .button {
  flex: 1 1 auto;
}

.field {
  display: grid;
  gap: var(--s2);
  min-width: 0;
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

input:where(:not([type="radio"], [type="checkbox"], [type="hidden"])),
select,
textarea {
  width: 100%;
  min-height: var(--control-height);
  padding: 0.5rem 0.75rem;
  color: var(--text);
  background: var(--surface);
  border: 2px solid var(--line-strong);
  border-radius: 0;
}

textarea {
  min-height: 7rem;
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  resize: vertical;
}

input:where(:not([type="radio"], [type="checkbox"], [type="hidden"])):hover,
select:hover,
textarea:hover {
  border-color: var(--accent);
}

input:where(:not([type="radio"], [type="checkbox"], [type="hidden"])):focus-visible,
select:focus-visible,
textarea:focus-visible {
  border-color: var(--accent);
}

input:where(:not([type="radio"], [type="checkbox"], [type="hidden"]))[aria-invalid="true"],
select[aria-invalid="true"],
textarea[aria-invalid="true"] {
  border-color: var(--danger);
}

.choice-group {
  display: grid;
  gap: var(--s2);
}

.choice {
  display: grid;
  grid-template-columns: 1.5rem minmax(0, 1fr);
  gap: var(--s3);
  align-items: start;
  padding: var(--s3) var(--s4);
  border: 1px solid var(--line);
  cursor: pointer;
}

.choice:hover {
  border-color: var(--accent);
}

.choice input,
.method-option input {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
  margin: 0.25rem 0 0;
  accent-color: var(--accent);
}

.choice:has(input:checked),
.method-option:has(input:checked) {
  background: var(--surface);
  border-color: var(--line-strong);
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
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
}

.table {
  width: 100%;
  font-size: var(--t-sm);
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-collapse: collapse;
}

.table-scrollable {
  min-width: 48rem;
}

.table-identifier {
  white-space: nowrap;
}

.table :where(th, td) {
  padding: var(--s3);
  text-align: left;
  vertical-align: top;
  border: 1px solid var(--line);
}

.table thead th {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 700;
  background: var(--surface);
  border-bottom: 2px solid var(--line-strong);
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
  min-height: var(--control-height);
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
  background: var(--surface);
  border: 1px solid var(--line);
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
  max-width: 100%;
  min-width: 0;
  padding: var(--s4);
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  line-height: var(--leading-normal);
  color: var(--text);
  white-space: pre;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 0;
}

.code-block .tok-key {
  color: var(--control);
}

.code-block .tok-string,
.code-block .tok-url {
  color: var(--accent);
}

.code-block .tok-keyword,
.code-block .tok-number {
  color: var(--accent-strong);
}

.code-block .tok-placeholder {
  color: var(--danger-strong);
}

.code-block .tok-comment {
  color: var(--muted);
}

/* Shared avatar gallery grid and card treatment. */
.avatar-showcase {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 8rem), 1fr));
  gap: var(--s4);
  padding: 0;
  margin: 0;
  list-style: none;
}

.avatar-card {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  text-align: center;
}

.avatar-card h3,
.avatar-card p {
  margin: 0;
}

.avatar-card p {
  color: var(--muted);
}

/* Views sample nearest texels, so pixelated scaling stays crisp. */
.avatar-card img {
  width: 100%;
  max-width: 7rem;
  height: auto;
  aspect-ratio: 1;
  object-fit: contain;
  image-rendering: pixelated;
}

.avatar-card code {
  color: var(--muted);
  font-size: var(--t-xs);
  overflow-wrap: anywhere;
}

.avatar-credit {
  margin-top: var(--s4);
  color: var(--muted);
  font-size: var(--t-sm);
  text-align: center;
}

/* One panel treatment for grouped cards; variants change only elevation, padding, or flush edges. */
.card {
  min-width: 0;
  padding: var(--panel-padding);
  background: var(--surface);
  border: 1px solid var(--line);
}

.card-compact {
  padding: var(--s4);
}

.card-flush {
  padding: 0;
}

.section {
  padding-block: var(--s7);
}

.section + .section {
  border-top: 1px solid var(--line);
}

.section-intro {
  max-width: var(--measure);
  margin-bottom: var(--s5);
  color: var(--muted);
  text-wrap: pretty;
}

.stack {
  display: grid;
  gap: var(--s4);
  min-width: 0;
}

.stack-tight {
  display: grid;
  gap: var(--s2);
  min-width: 0;
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
  grid-template-columns: minmax(0, 10rem) minmax(0, 1fr);
  gap: var(--s3);
}

.summary-list-stacked > div {
  grid-template-columns: minmax(0, 1fr);
}

.summary-list dt {
  font-size: var(--t-xs);
  font-weight: 700;
  color: var(--muted);
}

.summary-list dd {
  min-width: 0;
  margin: 0;
}

.summary-list code {
  overflow-wrap: anywhere;
}

@media (max-width: 40rem) {
  .summary-list > div {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s1);
  }
}

.muted {
  color: var(--muted);
}
`;
