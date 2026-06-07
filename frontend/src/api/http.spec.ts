import { describe, it, expect } from 'vitest';
import { http } from './http';

describe('http instance', () => {
  it('uses /api as baseURL', () => {
    expect(http.defaults.baseURL).toBe('/api');
  });

  it('is an axios instance with get/post methods', () => {
    expect(typeof http.get).toBe('function');
    expect(typeof http.post).toBe('function');
  });
});
