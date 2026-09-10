import { createServer as createTcpServer } from 'node:net';

export async function findAvailablePort(): Promise<number> {
  const listener = createTcpServer();
  return await new Promise<number>((resolve, reject): void => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', (): void => {
      const address = listener.address();
      if (address === null || typeof address === 'string') {
        listener.close();
        reject(new Error('Could not allocate a TCP test port'));
        return;
      }

      listener.close((error?: Error): void => {
        if (error === undefined) {
          resolve(address.port);
        } else {
          reject(error);
        }
      });
    });
  });
}
