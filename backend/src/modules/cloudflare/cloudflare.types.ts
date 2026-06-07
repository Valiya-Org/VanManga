export interface CloudflareState {
  active: boolean;
  cfClearance: string | null;
  userAgent: string | null;
  updatedAt: Date | null;
}

export interface FlareSolverrCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  size?: number;
  httpOnly?: boolean;
  secure?: boolean;
  session?: boolean;
}

export interface FlareSolverrSolution {
  url: string;
  status: number;
  cookies: FlareSolverrCookie[];
  userAgent: string;
  headers?: Record<string, string>;
  response?: string;
}

export interface FlareSolverrResponse {
  status: 'ok' | 'error';
  message: string;
  solution?: FlareSolverrSolution;
  startTimestamp?: number;
  endTimestamp?: number;
  version?: string;
}
