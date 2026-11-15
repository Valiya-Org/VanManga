/** The URL when it is an absolute http(s) URL, otherwise null. */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * Opens an external http(s) link in a new tab without giving it a handle on
 * this page. Any other scheme (`javascript:`, `data:` …) is refused.
 * Returns whether the link was opened.
 */
export function openExternal(url: string | null | undefined): boolean {
  const safe = safeExternalUrl(url);
  if (!safe) return false;
  window.open(safe, '_blank', 'noopener,noreferrer');
  return true;
}
