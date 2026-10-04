// Fetching public web pages (recipe import). The Node implementation, with its
// guards, is lib/page-fetcher.ts; this file stays runtime-neutral because
// app-type.ts reaches it.

export interface PageFetcher {
  /** The page's HTML. Throws for anything it won't or can't fetch. */
  fetchHtml(url: string): Promise<string>
}
