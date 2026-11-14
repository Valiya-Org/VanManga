import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { kavitaLogin as apiKavitaLogin } from '@/api/endpoints';
import { isApiError } from '@/api/errors';
import { setAdminTokenProvider } from '@/api/http';
import { useConfigStore } from './config';

/** localStorage key for the Kavita login link (the admin token is never stored). */
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

/** What is persisted: only the login link (it embeds the Kavita apiKey). */
interface StoredKavita {
  loginUrl: string;
}

/** Kavita errors that mean the stored login link is useless. */
const KAVITA_CLEARING_ERRORS = new Set(['kavita-disabled', 'kavita-refresh-failed']);

function removePersisted(): void {
  try {
    localStorage.removeItem(KAVITA_STORAGE_KEY);
  } catch {
    // storage unavailable
  }
}

function persist(loginUrl: string | null): void {
  try {
    if (loginUrl) {
      const value: StoredKavita = { loginUrl };
      localStorage.setItem(KAVITA_STORAGE_KEY, JSON.stringify(value));
    } else {
      localStorage.removeItem(KAVITA_STORAGE_KEY);
    }
  } catch {
    // storage unavailable: the link lives in memory only
  }
}

/**
 * Reads the stored login link. An old-format entry (the full login result
 * with jwt/refreshToken) is rewritten to `{ loginUrl }`; anything unusable
 * is removed.
 */
function readPersisted(): string | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KAVITA_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    v = null;
  }
  const loginUrl = (v as Partial<StoredKavita> | null)?.loginUrl;
  if (typeof loginUrl !== 'string' || !loginUrl) {
    removePersisted();
    return null;
  }
  if (Object.keys(v as object).length !== 1) persist(loginUrl);
  return loginUrl;
}

export const useSessionStore = defineStore('session', () => {
  // ------------------------------------------------------------ Kavita

  /**
   * Stored Kavita login link (persisted). Open it as-is (new tab or hidden
   * iframe) to sign the browser in. Its presence does NOT mean the Kavita
   * session is still valid.
   */
  const kavitaLoginUrl = ref<string | null>(readPersisted());
  /** A login link is stored (not: the Kavita session is known to be valid). */
  const kavitaLoggedIn = computed(() => kavitaLoginUrl.value !== null);

  function setLoginUrl(value: string | null): void {
    kavitaLoginUrl.value = value || null;
    persist(kavitaLoginUrl.value);
  }

  /**
   * `POST /api/kavita/login`. Rejects with ApiError (e.g.
   * kavita-login-failed); `kavita-disabled` also clears the stored link.
   */
  async function kavitaLogin(username: string, password: string): Promise<void> {
    try {
      setLoginUrl((await apiKavitaLogin(username, password)).loginUrl);
    } catch (err) {
      if (isApiError(err) && KAVITA_CLEARING_ERRORS.has(err.error)) setLoginUrl(null);
      throw err;
    }
  }

  function kavitaLogout(): void {
    setLoginUrl(null);
  }

  // Kavita switched off on the server: drop the stale link.
  const config = useConfigStore();
  watch(
    () => config.config?.kavitaEnabled,
    (enabled) => {
      if (enabled === false) setLoginUrl(null);
    },
    { immediate: true },
  );

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
    kavitaLoggedIn,
    kavitaLoginUrl,
    kavitaLogin,
    kavitaLogout,
    adminToken,
    setAdminToken,
    setAdminTokenPrompt,
    withAdmin,
  };
});
