import { AppError } from '#core/errors.ts';
import type { Fetch } from '#core/http/fetch.ts';

/** Image formats an icon may be stored in, identified by their content rather than the server's claim. */
export const iconTypes = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/x-icon',
  'image/svg+xml',
] as const;

export type IconType = (typeof iconTypes)[number];

export interface Icon {
  type: IconType;
  data: Uint8Array;
}

/** Icons larger than this are skipped; pages are read up to it, which covers any `<head>`. */
const maxBytes = 1024 * 1024;
/** Declared icons tried before falling back to `/favicon.ico`. */
const maxCandidates = 4;

/**
 * Find the icon for `source`, which is either an image or a web page. A page's declared icons are tried from the
 * largest, then `/favicon.ico` of the site. Resolves to undefined when the site has no usable icon; rejects with an
 * AppError only when the site cannot be reached at all.
 */
export async function discoverIcon(source: string, fetch: Fetch, signal: AbortSignal): Promise<Icon | undefined> {
  let page: Body;
  try {
    page = await get(fetch, source, 'text/html,image/*;q=0.9,*/*;q=0.8', signal);
  } catch (error) {
    if (signal.aborted) throw new AppError('bad_gateway', '获取图标超时，请稍后重试', { cause: error });
    throw new AppError('bad_gateway', '无法连接到图标所在的网站', { cause: error });
  }

  const tried = new Set([source]);
  if (page.ok) {
    const icon = toIcon(page);
    if (icon) return icon;
    if (looksLikeHtml(page)) {
      const candidates = parseIconLinks(new TextDecoder().decode(page.bytes), page.url).filter(
        (url) => !tried.has(url),
      );
      for (const url of candidates.slice(0, maxCandidates)) {
        tried.add(url);
        const found = await tryImage(fetch, url, signal);
        if (found) return found;
      }
    }
  }

  const favicon = new URL('/favicon.ico', page.url).toString();
  if (tried.has(favicon)) return undefined;
  return tryImage(fetch, favicon, signal);
}

interface Body {
  ok: boolean;
  /** The final URL after redirects, which relative links resolve against. */
  url: string;
  contentType: string;
  bytes: Uint8Array;
  truncated: boolean;
}

async function get(fetch: Fetch, url: string, accept: string, signal: AbortSignal): Promise<Body> {
  // Nothing secret is sent, so redirects are followed: sites commonly redirect to a canonical host.
  const response = await fetch(url, { headers: { accept }, signal, redirect: 'follow', credentials: 'omit' });
  const finalUrl = response.url || url;
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    return { ok: false, url: finalUrl, contentType, bytes: new Uint8Array(), truncated: false };
  }
  const { bytes, truncated } = await readPrefix(response, maxBytes);
  return { ok: true, url: finalUrl, contentType, bytes, truncated };
}

/** Any failure of a single candidate just moves on to the next one. */
async function tryImage(fetch: Fetch, url: string, signal: AbortSignal) {
  try {
    const body = await get(fetch, url, 'image/*', signal);
    return body.ok ? toIcon(body) : undefined;
  } catch {
    return undefined;
  }
}

/** Read at most `limit` bytes of the body; the rest is discarded. */
async function readPrefix(response: Response, limit: number) {
  const reader = response.body?.getReader();
  if (!reader) return { bytes: new Uint8Array(), truncated: false };
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > limit) {
        chunks.push(value.subarray(0, limit - size));
        size = limit;
        truncated = true;
        break;
      }
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return { bytes: new Uint8Array(Buffer.concat(chunks)), truncated };
}

function toIcon(body: Body): Icon | undefined {
  if (body.truncated || !body.bytes.byteLength) return undefined;
  const type = sniffImage(body.bytes);
  return type && { type, data: body.bytes };
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

const svgStart =
  /^\uFEFF?\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE\s+svg[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i;

/** The image format from the file's leading bytes; servers often send icons with a wrong or generic type. */
export function sniffImage(bytes: Uint8Array): IconType | undefined {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) return 'image/gif';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00]) && bytes.byteLength > 6) return 'image/x-icon';
  const head = new TextDecoder().decode(bytes.subarray(0, 4096));
  if (svgStart.test(head)) return 'image/svg+xml';
  return undefined;
}

function looksLikeHtml(body: Body) {
  if (body.contentType.includes('html')) return true;
  return /^\uFEFF?\s*<(!doctype\s+html|html|head)[\s>]/i.test(new TextDecoder().decode(body.bytes.subarray(0, 1024)));
}

const tagPattern = /<(link|base)\b([^>]*)>/gi;
const attributePattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function attributes(source: string) {
  const result = new Map<string, string>();
  for (const match of source.matchAll(attributePattern)) {
    const name = match[1]?.toLowerCase();
    if (name && !result.has(name)) result.set(name, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return result;
}

const decodeEntities = (value: string) =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/**
 * The http(s) icons a page declares, largest first. `apple-touch-icon` is usually 180px, so it beats a 16px or
 * 32px favicon; an SVG or `sizes="any"` scales to any size. `mask-icon` is skipped: it is a single-color stencil.
 */
export function parseIconLinks(html: string, pageUrl: string) {
  let base = pageUrl;
  const icons: { url: string; size: number; order: number }[] = [];
  for (const match of html.matchAll(tagPattern)) {
    const attrs = attributes(match[2] ?? '');
    const href = attrs.get('href')?.trim();
    if (!href) continue;
    if (match[1]?.toLowerCase() === 'base') {
      // Only the first <base> counts, and only before the links it applies to.
      if (base === pageUrl) base = resolve(href, pageUrl) ?? pageUrl;
      continue;
    }
    const rel = new Set((attrs.get('rel') ?? '').toLowerCase().split(/\s+/));
    const touch = rel.has('apple-touch-icon') || rel.has('apple-touch-icon-precomposed');
    if (!touch && !rel.has('icon')) continue;
    const url = resolve(href, base);
    if (!url) continue;
    icons.push({ url, size: declaredSize(attrs, url, touch), order: icons.length });
  }
  return [...new Set(icons.sort((a, b) => b.size - a.size || a.order - b.order).map((icon) => icon.url))];
}

function declaredSize(attrs: Map<string, string>, url: string, touch: boolean) {
  const sizes = attrs.get('sizes')?.toLowerCase() ?? '';
  const svg = attrs.get('type')?.toLowerCase() === 'image/svg+xml' || /\.svg(?:[?#]|$)/i.test(url);
  if (sizes.split(/\s+/).includes('any') || svg) return 512;
  const declared = [...sizes.matchAll(/(\d+)x(\d+)/g)].map((size) => Math.min(Number(size[1]), Number(size[2])));
  if (declared.length) return Math.max(...declared);
  return touch ? 180 : 32;
}

function resolve(href: string, base: string) {
  try {
    const url = new URL(href, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
