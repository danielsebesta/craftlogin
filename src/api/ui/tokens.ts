export const uiTokenStyles = `
:root {
  color-scheme: dark;
  --bg: oklch(0.16 0.008 150);
  --surface: oklch(0.2 0.01 150);
  --surface-raised: oklch(0.24 0.012 150);
  --pattern: oklch(0.26 0.014 150);
  --line: oklch(0.32 0.012 150);
  --line-strong: oklch(0.55 0.014 150);
  --text: oklch(0.94 0.005 150);
  --muted: oklch(0.74 0.01 150);
  --control: oklch(0.92 0.006 150);
  --control-strong: oklch(0.98 0.004 150);
  --control-ink: oklch(0.17 0.01 150);
  --accent: oklch(0.8 0.15 128);
  --accent-strong: oklch(0.87 0.16 128);
  --danger: oklch(0.72 0.15 25);
  --danger-strong: oklch(0.82 0.13 25);
  --focus: oklch(0.9 0.12 128);
  --font-sans: "Pixeloid Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Pixeloid Mono", ui-monospace, "SFMono-Regular", monospace;
  --s1: 0.25rem;
  --s2: 0.5rem;
  --s3: 0.75rem;
  --s4: 1rem;
  --s5: 1.5rem;
  --s6: 2rem;
  --s7: 3rem;
  --s8: 4rem;
  --t-xs: 0.8125rem;
  --t-sm: 0.875rem;
  --t-base: 1rem;
  --t-lg: 1.2rem;
  --t-xl: 1.45rem;
  --t-2xl: 1.75rem;
  --t-3xl: 2.1rem;
  --measure: 68ch;
  --container: 72rem;
  /* Widest content column for the current page: narrow surfaces narrow it. */
  --page-width: var(--container);
}
`;
