import 'minecraft-protocol';

declare module 'minecraft-protocol' {
  interface Client {
    _supportFeature(feature: string): boolean;
  }

  interface Server {
    once(event: 'close', listener: () => void): this;
  }
}
