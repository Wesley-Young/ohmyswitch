import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { constants, zstdDecompress } from 'node:zlib';

const decompress = promisify(zstdDecompress);

/** DSH appends a standard Zstandard frame per batch. Walk RFC 8878 block lengths, independent of payload bytes. */
function frameEnd(bytes: Buffer, start: number): number | undefined {
  if (bytes.length - start < 4) return undefined;
  if (bytes.readUInt32LE(start) !== 0xfd2fb528) throw new Error('Invalid DSH frame magic');
  if (bytes.length - start < 5) return undefined;
  const header = bytes.readUInt8(start + 4);
  if ((header & 0x18) !== 0) throw new Error('Invalid DSH frame descriptor');
  const singleSegment = (header & 0x20) !== 0;
  const sizeFlag = header >>> 6;
  const sizeBytes = sizeFlag === 0 ? Number(singleSegment) : 1 << sizeFlag;
  const dictionaryFlag = header & 3;
  const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
  let offset = start + 5 + Number(!singleSegment) + dictionaryBytes + sizeBytes;
  while (offset + 3 <= bytes.length) {
    const block = bytes.readUIntLE(offset, 3);
    const kind = (block >>> 1) & 3;
    if (kind === 3) throw new Error('Invalid DSH block type');
    // Run-length blocks encode their entire decoded span with a single byte.
    offset += 3 + (kind === 1 ? 1 : block >>> 3);
    if (block & 1) {
      const end = offset + (header & 4 ? 4 : 0);
      return end <= bytes.length ? end : undefined;
    }
  }
  return undefined;
}

/** Node 24 can silently stop at the first concatenated frame. Give the native decoder exactly one at a time. */
export async function* readSessionFrames(path: string): AsyncGenerator<Buffer> {
  const bytes = await readFile(path);
  let offset = 0;
  while (offset < bytes.length) {
    const end = frameEnd(bytes, offset);
    if (end === undefined) {
      // A live writer may still be appending the last frame. Only complete JSONL records are recoverable.
      const tail = await decompress(bytes.subarray(offset), { finishFlush: constants.ZSTD_e_flush });
      yield tail.subarray(0, tail.lastIndexOf(10) + 1);
      return;
    }
    yield await decompress(bytes.subarray(offset, end));
    offset = end;
  }
}
