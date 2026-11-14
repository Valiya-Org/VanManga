/** Browser-like User-Agent for direct requests to the manga source.
 *  dogemanga sits behind Cloudflare, which answers non-browser agents
 *  (e.g. `axios/x.y`) with a 403 even when no challenge is active. The
 *  legacy Flask app always went out through DrissionPage with a browser UA. */
export const DEFAULT_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
