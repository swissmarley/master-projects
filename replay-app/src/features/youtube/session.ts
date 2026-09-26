import { parseVisitorDataFromSwJs } from './innertube';

/**
 * YouTube's anonymous visitor ID. Sending it with Innertube requests makes
 * them part of the same session as the in-app browser, which is what a real
 * client does and makes "confirm you're not a bot" challenges less likely.
 */
let visitorData: string | undefined;
let pending: Promise<string | undefined> | null = null;

const VISITOR_RE = /^[A-Za-z0-9_%=-]{10,200}$/;

/** Called with `ytcfg.get('VISITOR_DATA')` reported by the browser page script. */
export function rememberVisitorData(value: string | null | undefined): void {
  if (value && VISITOR_RE.test(value)) visitorData = value;
}

export function getKnownVisitorData(): string | undefined {
  return visitorData;
}

/** Returns the visitor ID, fetching one from YouTube if the browser has not provided it yet. */
export function getVisitorData(fetchImpl: typeof fetch = fetch): Promise<string | undefined> {
  if (visitorData) return Promise.resolve(visitorData);
  pending ??= fetchImpl('https://www.youtube.com/sw.js_data')
    .then(async (response) => {
      if (!response.ok) return undefined;
      rememberVisitorData(parseVisitorDataFromSwJs(await response.text()));
      return visitorData;
    })
    .catch(() => undefined)
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Test helper. */
export function resetVisitorData(): void {
  visitorData = undefined;
  pending = null;
}
