import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { kavitaLogin as apiKavitaLogin, kavitaRefreshToken } from '@/api/endpoints';
import { isApiError } from '@/api/errors';
import { setAdminTokenProvider } from '@/api/http';
import type { KavitaLoginResult } from '@/api/types';

/** localStorage key for the Kavita session (the admin token is never stored). */
export const KAVITA_STORAGE_KEY = 'vanmanga.kavita';

export interface AdminTokenRequest {
  /** Why the token is needed: none sent yet, or the last one was wrong. */
  reason: 'admin-token-required' | 'admin-token-invalid';
}

/**
 * UI hook that asks the user for the admin token. Resolve with the token to
 * retry, or with `null` (or empty) to give up.
 */
export type AdminTokenPrompt = (req: AdminTokenRequest) => Promise<string | null>;

function readPersisted(): KavitaLoginResult | null {
  try {
    const raw = localStorage.getItem(KAVITA_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<KavitaLoginResult>;
    if (v && typeof v.jwt === 'string' && typeof v.loginUrl === 'string') {
      return v as KavitaLoginResult;
    }
  } catch {
    // corrupt entry or storage unavailable: start logged out
  }
  return null;
}

function persist(value: KavitaLoginResult | null): void {
  try {
    if (value) localStorage.setItem(KAVITA_STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(KAVITA_STORAGE_KEY);
  } catch {
    // storage unavailable: session lives in memory only
  }
}

export const useSessionStore = defineStore('session', () => {
  // ------------------------------------------------------------ Kavita

  /** Kavita login result; persisted so the user stays logged in. */
  const kavita = ref<KavitaLoginResult | null>(readPersisted());
  const kavitaLoggedIn = computed(() => kavita.value !== null);
  /** Open this URL (e.g. in a new tab or hidden iframe) to sign the browser in. */
  const kavitaLoginUrl = computed(() => kavita.value?.loginUrl ?? null);

  function setKavita(value: KavitaLoginResult | null): void {
    kavita.value = value;
    persist(value);
  }

  /** `POST /api/kavita/login`. Rejects with ApiError (e.g. kavita-login-failed). */
  async function kavitaLogin(username: string, password: string): Promise<void> {
    setKavita(await apiKavitaLogin(username, password));
  }

  /** Refreshes the JWT. A rejected refresh token logs out; other errors keep the session. */
  async function refreshKavitaToken(): Promise<void> {
    const current = kavita.value;
    if (!current) return;
    try {
      const tokens = await kavitaRefreshToken(current);
      setKavita({ ...current, ...tokens });
    } catch (err) {
      if (isApiError(err) && err.error === 'kavita-refresh-failed') setKavita(null);
      throw err;
    }
  }

  function kavitaLogout(): void {
    setKavita(null);
  }

  // ------------------------------------------------------------ admin token

  /** Held in memory for this page session only; never persisted. */
  const adminToken = ref<string | null>(null);
  let prompt: AdminTokenPrompt | null = null;
  let pendingPrompt: Promise<string | null> | null = null;

  setAdminTokenProvider(() => adminToken.value);

  function setAdminToken(token: string | null): void {
    adminToken.value = token || null;
  }

  /** Registers the UI callback used by {@link withAdmin}. `null` unregisters. */
  function setAdminTokenPrompt(fn: AdminTokenPrompt | null): void {
    prompt = fn;
  }

  function askOnce(req: AdminTokenRequest): Promise<string | null> {
    if (!pendingPrompt) {
      pendingPrompt = prompt!(req).finally(() => {
        pendingPrompt = null;
      });
    }
    return pendingPrompt;
  }

  /**
   * Runs an admin-protected call. On 401 `admin-token-required|invalid`
   * asks for the token via the registered prompt, stores it and retries the
   * same call; repeats until success or the user cancels, in which case the
   * last 401 ApiError is rethrown. Concurrent callers share one prompt.
   */
  async function withAdmin<T>(op: () => Promise<T>): Promise<T> {
    for (;;) {
      try {
        return await op();
      } catch (err) {
        if (!isApiError(err) || !err.isAdminTokenError || !prompt) throw err;
        const reason = err.error as AdminTokenRequest['reason'];
        const token = await askOnce({ reason });
        if (!token) {
          if (reason === 'admin-token-invalid') adminToken.value = null;
          throw err;
        }
        adminToken.value = token;
      }
    }
  }

  return {
    kavita,
    kavitaLoggedIn,
    kavitaLoginUrl,
    kavitaLogin,
    refreshKavitaToken,
    kavitaLogout,
    adminToken,
    setAdminToken,
    setAdminTokenPrompt,
    withAdmin,
  };
});
