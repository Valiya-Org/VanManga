import { describe, it, expect, vi, afterEach } from 'vitest';
import { openExternal, safeExternalUrl } from './open-external';

afterEach(() => vi.restoreAllMocks());

describe('safeExternalUrl', () => {
  it('accepts http and https URLs', () => {
    expect(safeExternalUrl('http://kavita.local/x')).toBe('http://kavita.local/x');
    expect(safeExternalUrl('https://kavita.example.com/')).toBe('https://kavita.example.com/');
  });

  it('refuses other schemes, relative and malformed values', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('data:text/html,hi')).toBeNull();
    expect(safeExternalUrl('/relative')).toBeNull();
    expect(safeExternalUrl('not a url')).toBeNull();
    expect(safeExternalUrl('')).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});

describe('openExternal', () => {
  it('opens an http(s) URL with noopener', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    expect(openExternal('https://kavita.example.com/')).toBe(true);
    expect(open).toHaveBeenCalledWith('https://kavita.example.com/', '_blank', 'noopener,noreferrer');
  });

  it('does not open a javascript: URL', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    expect(openExternal('javascript:alert(1)')).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
