import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api/http', () => ({
  http: { get: vi.fn(), post: vi.fn() },
}));

import { http } from '@/api/http';
import { kavitaLogin, kavitaStatus } from './kavita';

const mockGet = http.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = http.post as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe('kavita api', () => {
  it('kavitaLogin POSTs /kavita/login with username and password', async () => {
    mockPost.mockResolvedValue({
      data: { code: 200, data: { apiKey: 'abc' } },
    });
    const res = await kavitaLogin('u', 'p');
    expect(mockPost).toHaveBeenCalledWith('kavita/login', {
      username: 'u',
      password: 'p',
    });
    expect(res.data.apiKey).toBe('abc');
  });

  it('kavitaStatus GETs /kavita/status', async () => {
    mockGet.mockResolvedValue({ data: { code: 200, data: null } });
    const res = await kavitaStatus();
    expect(mockGet).toHaveBeenCalledWith('kavita/status');
    expect(res.code).toBe(200);
  });
});
