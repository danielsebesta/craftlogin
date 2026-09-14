import { fontFaceStyles } from './ui/fonts.js';
import { uiTokenStyles } from './ui/tokens.js';

const swaggerTheme = `
html {
  background: var(--bg);
}

body {
  margin: 0;
  color: var(--text);
  background: var(--bg);
  font-family: var(--font-sans);
}

.swagger-ui {
  color: var(--text);
  font-family: var(--font-sans);
}

.swagger-ui .wrapper,
.swagger-ui .info,
.swagger-ui .scheme-container,
.swagger-ui .opblock,
.swagger-ui .models,
.swagger-ui section.models,
.swagger-ui .model-container,
.swagger-ui .responses-inner,
.swagger-ui .dialog-ux .modal-ux {
  background: transparent;
}

.swagger-ui .scheme-container {
  border-bottom: 1px solid var(--line);
}

.swagger-ui .opblock,
.swagger-ui section.models,
.swagger-ui .models-control,
.swagger-ui .opblock-tag,
.swagger-ui .model-container,
.swagger-ui .opblock .opblock-section-header,
.swagger-ui .dialog-ux .modal-ux,
.swagger-ui .dialog-ux .modal-ux-header,
.swagger-ui .responses-table,
.swagger-ui table thead tr th,
.swagger-ui table thead tr td,
.swagger-ui .errors-wrapper,
.swagger-ui .property-row,
.swagger-ui .model .property {
  border-color: var(--line);
}

.swagger-ui .opblock,
.swagger-ui .models-control,
.swagger-ui .opblock-tag,
.swagger-ui .model-container,
.swagger-ui .opblock .opblock-section-header,
.swagger-ui .dialog-ux .modal-ux-header {
  background: var(--surface);
}

.swagger-ui .opblock.opblock-get,
.swagger-ui .opblock.opblock-post,
.swagger-ui .opblock.opblock-put,
.swagger-ui .opblock.opblock-delete,
.swagger-ui .opblock.opblock-patch,
.swagger-ui .opblock.opblock-head,
.swagger-ui .opblock.opblock-options,
.swagger-ui .opblock.opblock-trace {
  background: var(--surface);
  border-color: var(--line);
}

.swagger-ui .opblock .opblock-summary-method,
.swagger-ui .opblock.opblock-get .opblock-summary-method,
.swagger-ui .opblock.opblock-post .opblock-summary-method,
.swagger-ui .opblock.opblock-put .opblock-summary-method,
.swagger-ui .opblock.opblock-delete .opblock-summary-method,
.swagger-ui .opblock.opblock-patch .opblock-summary-method,
.swagger-ui .opblock.opblock-head .opblock-summary-method,
.swagger-ui .opblock.opblock-options .opblock-summary-method,
.swagger-ui .opblock.opblock-trace .opblock-summary-method,
.swagger-ui .btn,
.swagger-ui .btn.execute,
.swagger-ui .btn.authorize,
.swagger-ui .btn-group .btn,
.swagger-ui .models-control,
.swagger-ui select,
.swagger-ui input[type="text"],
.swagger-ui input[type="email"],
.swagger-ui input[type="password"],
.swagger-ui textarea,
.swagger-ui .info .title small {
  border-radius: 0;
  box-shadow: none;
  text-shadow: none;
}

.swagger-ui .opblock .opblock-summary-method,
.swagger-ui .opblock.opblock-get .opblock-summary-method,
.swagger-ui .opblock.opblock-post .opblock-summary-method,
.swagger-ui .opblock.opblock-put .opblock-summary-method,
.swagger-ui .opblock.opblock-delete .opblock-summary-method,
.swagger-ui .opblock.opblock-patch .opblock-summary-method,
.swagger-ui .opblock.opblock-head .opblock-summary-method,
.swagger-ui .opblock.opblock-options .opblock-summary-method,
.swagger-ui .opblock.opblock-trace .opblock-summary-method,
.swagger-ui .btn.execute,
.swagger-ui .btn.authorize {
  color: var(--control-ink);
  background: var(--control);
  border-color: var(--control);
}

.swagger-ui .model-box,
.swagger-ui .model-box .model-box,
.swagger-ui .highlight-code,
.swagger-ui .microlight,
.swagger-ui .model-example,
.swagger-ui .request-body__inner .model-example,
.swagger-ui .responses-inner .curl,
.swagger-ui .opblock-body pre.microlight,
.swagger-ui .opblock pre.microlight {
  background: transparent;
}

.swagger-ui .markdown code,
.swagger-ui .renderedMarkdown code {
  color: var(--accent);
  background: transparent;
}

.swagger-ui .opblock-body pre.microlight,
.swagger-ui .microlight {
  color: var(--text);
}

.swagger-ui .btn.authorize svg {
  fill: var(--control-ink);
}

.swagger-ui .btn,
.swagger-ui select,
.swagger-ui input[type="text"],
.swagger-ui input[type="email"],
.swagger-ui input[type="password"],
.swagger-ui textarea,
.swagger-ui .info .title small {
  color: var(--text);
  background: var(--surface-raised);
  border: 2px solid var(--line-strong);
}

.swagger-ui .info .title,
.swagger-ui .opblock-tag,
.swagger-ui .opblock-summary-path,
.swagger-ui .model-title,
.swagger-ui .model,
.swagger-ui .model .property,
.swagger-ui .parameter__name,
.swagger-ui .response-col_status,
.swagger-ui .opblock .opblock-section-header h4,
.swagger-ui .tab li.active button.tablinks,
.swagger-ui .dialog-ux .modal-ux-header h3 {
  color: var(--text);
}

.swagger-ui .info p,
.swagger-ui .info li,
.swagger-ui .info .base-url,
.swagger-ui .markdown p,
.swagger-ui .markdown li,
.swagger-ui .renderedMarkdown p,
.swagger-ui .opblock-description-wrapper p,
.swagger-ui .opblock-title_normal p,
.swagger-ui .parameter__type,
.swagger-ui .parameter__in,
.swagger-ui .response-col_links,
.swagger-ui .response-col_description__inner p,
.swagger-ui .tab li button.tablinks,
.swagger-ui table thead tr th,
.swagger-ui table thead tr td,
.swagger-ui .model .property.primitive,
.swagger-ui .prop-type,
.swagger-ui .prop-format,
.swagger-ui label {
  color: var(--muted);
}

.swagger-ui a,
.swagger-ui .info a,
.swagger-ui .markdown a,
.swagger-ui .renderedMarkdown a {
  color: var(--text);
}

.swagger-ui a:hover,
.swagger-ui .info a:hover {
  color: var(--accent-strong);
}

.swagger-ui code,
.swagger-ui pre,
.swagger-ui .parameter__name,
.swagger-ui .prop-name,
.swagger-ui .response-col_status,
.swagger-ui .model-box,
.swagger-ui .microlight {
  font-family: var(--font-mono);
}


.swagger-ui table thead tr th,
.swagger-ui .tab li.active button.tablinks {
  border-bottom-color: var(--line);
}

.swagger-ui .tab li.active button.tablinks {
  border-bottom: 2px solid var(--accent);
}

.swagger-ui .opblock:hover,
.swagger-ui .opblock-tag:hover,
.swagger-ui .model-container:hover,
.swagger-ui .models-control:hover {
  background: var(--surface-raised);
}

.swagger-ui .error,
.swagger-ui .errors-wrapper .errors h4,
.swagger-ui .errors-wrapper .errors small {
  color: var(--danger-strong);
}

.swagger-ui .errors-wrapper,
.swagger-ui .errors-wrapper .errors {
  background: transparent;
  border-color: var(--danger);
}

.swagger-ui .topbar {
  display: none;
}

.swagger-ui .loading-container .loading:after {
  border-color: var(--line-strong);
  border-top-color: var(--accent);
}

.swagger-ui .info .title,
.swagger-ui .opblock-tag,
.swagger-ui .opblock-summary-method,
.swagger-ui h1,
.swagger-ui h2,
.swagger-ui h3,
.swagger-ui h4,
.swagger-ui h5,
.swagger-ui .model-title,
.swagger-ui table thead tr th {
  font-family: var(--font-sans);
  font-weight: 700;
}

.swagger-ui button,
.swagger-ui input,
.swagger-ui select,
.swagger-ui textarea,
.swagger-ui .opblock-summary-description,
.swagger-ui section.models h4,
.swagger-ui section.models h4 span,
.swagger-ui .json-schema-2020-12,
.swagger-ui .json-schema-2020-12__title,
.swagger-ui .json-schema-2020-12-expand-deep-button {
  font-family: var(--font-sans);
}

.swagger-ui section.models h4,
.swagger-ui section.models h4 span,
.swagger-ui .models-control,
.swagger-ui .json-schema-2020-12__title {
  color: var(--text);
}

.swagger-ui .opblock-summary-description,
.swagger-ui .opblock .opblock-summary-description,
.swagger-ui .opblock .opblock-summary-path,
.swagger-ui .opblock .opblock-summary-path__deprecated,
.swagger-ui .opblock .opblock-summary-operation-id,
.swagger-ui .json-schema-2020-12-expand-deep-button,
.swagger-ui .json-schema-2020-12__attribute--muted {
  color: var(--muted);
}

.swagger-ui .json-schema-2020-12__attribute,
.swagger-ui .json-schema-2020-12__attribute--primary,
.swagger-ui .json-schema-2020-12__attribute--warning {
  color: var(--text);
  font-family: var(--font-mono);
}

.swagger-ui .info .title small pre,
.swagger-ui .info .title small.version-stamp,
.swagger-ui .version-stamp,
.swagger-ui .version-stamp .version {
  color: var(--muted);
  background: var(--surface-raised);
}

.swagger-ui .json-schema-2020-12,
.swagger-ui .json-schema-2020-12__title,
.swagger-ui .json-schema-2020-12-accordion__children,
.swagger-ui .json-schema-2020-12__attribute {
  border-color: var(--line);
}

.swagger-ui .btn,
.swagger-ui select,
.swagger-ui input,
.swagger-ui .models-control,
.swagger-ui .json-schema-2020-12-expand-deep-button {
  min-height: 2.75rem;
}

.swagger-ui .json-schema-2020-12-expand-deep-button,
.swagger-ui .json-schema-2020-12-accordion,
.swagger-ui .json-schema-2020-12-accordion__children,
.swagger-ui .json-schema-2020-12-body,
.swagger-ui .json-schema-2020-12__title {
  background: transparent;
}

`;

export const swaggerThemeStyles = `${fontFaceStyles}${uiTokenStyles}${swaggerTheme}`;
