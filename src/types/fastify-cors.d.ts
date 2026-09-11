import 'fastify';

declare module 'fastify' {
  interface FastifyContextConfig {
    readonly cors?:
      | false
      | {
          readonly allowedHeaders?: readonly string[] | string;
          readonly credentials?: boolean;
          readonly exposedHeaders?: readonly string[] | string;
          readonly methods?: readonly string[] | string;
          readonly origin?: boolean | readonly string[] | string;
        };
  }
}
