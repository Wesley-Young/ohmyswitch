/** Thrown by `readLimitedText` when the body exceeds the limit. */
export class BodyTooLargeError extends Error {
  override readonly name = 'BodyTooLargeError';
}

/** Read a response body as UTF-8, giving up once it grows past `maxBytes`. */
export async function readLimitedText(response: Response, maxBytes: number) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new BodyTooLargeError(`Response body exceeds ${maxBytes} bytes`);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}
