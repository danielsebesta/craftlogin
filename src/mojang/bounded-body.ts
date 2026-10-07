// Hard cap for reading response bodies so a hostile or broken upstream can't
// exhaust memory.
export class BoundedResponseError extends Error {
  public override readonly name: string = 'BoundedResponseError';
}

export class ResponseBodyTooLargeError extends BoundedResponseError {
  public override readonly name = 'ResponseBodyTooLargeError';
}

export class ResponseBodyReadError extends BoundedResponseError {
  public override readonly name = 'ResponseBodyReadError';
}

export async function readBoundedResponseBody(
  response: Response,
  maxBytes: number,
  label: string,
): Promise<Buffer> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      await response.body?.cancel().catch((): undefined => undefined);
      throw new ResponseBodyTooLargeError(`${label} image exceeds the size limit`);
    }
  }
  if (response.body === null) {
    return Buffer.alloc(0);
  }

  const readerCandidate: unknown = response.body.getReader();
  if (!isStreamReader(readerCandidate)) {
    throw new ResponseBodyReadError(`${label} stream is unavailable`);
  }
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  let result = readStreamResult(await readerCandidate.read(), label);
  while (!result.done) {
    receivedBytes += result.value.byteLength;
    if (receivedBytes > maxBytes) {
      await readerCandidate.cancel().catch((): undefined => undefined);
      throw new ResponseBodyTooLargeError(`${label} image exceeds the size limit`);
    }
    chunks.push(result.value);
    result = readStreamResult(await readerCandidate.read(), label);
  }
  return Buffer.concat(chunks, receivedBytes);
}

interface UnknownStreamReader {
  cancel(): Promise<unknown>;
  read(): Promise<unknown>;
}

function isStreamReader(value: unknown): value is UnknownStreamReader {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const read: unknown = Reflect.get(value, 'read');
  const cancel: unknown = Reflect.get(value, 'cancel');
  return typeof read === 'function' && typeof cancel === 'function';
}

type StreamReadResult =
  { readonly done: false; readonly value: Uint8Array } | { readonly done: true };

function readStreamResult(value: unknown, label: string): StreamReadResult {
  if (typeof value !== 'object' || value === null) {
    throw new ResponseBodyReadError(`${label} stream returned invalid data`);
  }
  const done: unknown = Reflect.get(value, 'done');
  if (done === true) {
    return { done: true };
  }
  const chunk: unknown = Reflect.get(value, 'value');
  if (done !== false || !(chunk instanceof Uint8Array)) {
    throw new ResponseBodyReadError(`${label} stream returned invalid data`);
  }
  return { done: false, value: chunk };
}
