import axios, { type AxiosInstance } from 'axios';

/**
 * Shared axios instance. All API modules import this.
 * baseURL '/api' matches the NestJS global prefix; in dev the Vite
 * proxy forwards /api to the backend.
 */
export const http: AxiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true,
});
