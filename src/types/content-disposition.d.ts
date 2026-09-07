import 'content-disposition';

declare module 'content-disposition' {
  // @types/koa still names the pre-2.0 interface; the package renamed it without keeping an alias.
  export type Options = CreateOptions;
}
