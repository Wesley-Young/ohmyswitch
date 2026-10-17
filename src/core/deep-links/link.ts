import { type Endpoint, endpoints } from '#core/endpoints.ts';
import { baseUrl } from '#core/provider.ts';

/** The URL scheme ohmyswitch registers with the operating system. */
export const linkScheme = 'ohmyswitch';

const maxLinkLength = 64 * 1024;
const maxModels = 2000;

/**
 * A provider as described by an import link, before the user has reviewed it. Values are kept as given (only
 * trimmed and length-capped) so invalid ones are reported on their field when the user saves, instead of the
 * whole link being rejected.
 */
export interface ImportDraft {
  name: string;
  baseUrl: string;
  /** Known endpoints from the link, in the site's order; empty when it listed none ohmyswitch knows. */
  endpoints: Endpoint[];
  apiKey: string;
  iconUrl: string;
  modelIds: string[];
}

export type ParsedLink = { kind: 'import'; draft: ImportDraft } | { kind: 'unsupported' };

/** Pick the ohmyswitch link out of a command line, as passed on Windows and Linux. */
export const findLink = (argv: readonly string[]) => argv.find((arg) => arg.startsWith(`${linkScheme}://`));

/** Read an `ohmyswitch://` link. Links of other schemes or actions are unsupported; see `docs/deep-link.md`. */
export function parseLink(link: string): ParsedLink {
  if (link.length > maxLinkLength) return { kind: 'unsupported' };
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return { kind: 'unsupported' };
  }
  if (url.protocol !== `${linkScheme}:`) return { kind: 'unsupported' };
  // Some platforms add a trailing slash to the path.
  const action = `${url.host}${url.pathname}`.replace(/\/+$/, '');
  if (action !== 'provider/import') return { kind: 'unsupported' };

  const params = url.searchParams;
  const text = (key: string, max: number) => (params.get(key) ?? '').trim().slice(0, max);
  const known = new Set<string>(endpoints);
  const listed = params.getAll('endpoint').map((value) => value.trim());
  const modelIds = params
    .getAll('model')
    .map((value) => value.trim())
    .filter((id) => id && id.length <= 256);

  return {
    kind: 'import',
    draft: {
      name: text('name', 128),
      baseUrl: normalizeBaseUrl(text('baseUrl', 2048)),
      endpoints: [...new Set(listed.filter((value): value is Endpoint => known.has(value)))],
      apiKey: text('apiKey', 4096),
      iconUrl: text('iconUrl', 2048),
      modelIds: [...new Set(modelIds)].slice(0, maxModels),
    },
  };
}

interface Candidate {
  id: string;
  baseUrl: string;
  endpoint: Endpoint;
}

/**
 * The existing provider an import updates: one on the same origin as the link's Base URL, serving one of the
 * link's endpoints. Endpoints are tried in the link's order, so the site's preferred one wins.
 */
export function findMatch<T extends Candidate>(providers: readonly T[], draft: ImportDraft) {
  const origin = originOf(draft.baseUrl);
  if (!origin) return undefined;
  for (const endpoint of draft.endpoints) {
    const match = providers.find((provider) => provider.endpoint === endpoint && originOf(provider.baseUrl) === origin);
    if (match) return match;
  }
  return undefined;
}

/** Shown as it will be saved (without a trailing `/v1`); an invalid value is kept so its field reports it. */
function normalizeBaseUrl(value: string) {
  const parsed = baseUrl.safeParse(value);
  return parsed.success ? parsed.data : value;
}

function originOf(value: string) {
  const parsed = baseUrl.safeParse(value);
  return parsed.success ? new URL(parsed.data).origin : undefined;
}
