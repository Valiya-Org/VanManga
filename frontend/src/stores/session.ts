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

  /**
   * Opens the prompt, or joins the one already open. A joiner never passes
   * its own reason: it just waits for the user's answer and re-evaluates.
   */
  function ask(reason: AdminTokenRequest['reason']): Promise<string | null> {
    if (!pendingPrompt) {
      const fn = prompt!;
      pendingPrompt = fn({ reason })
        .then((t) => t || null)
        .finally(() => {
          pendingPrompt = null;
        });
    }
    return pendingPrompt;
  }

  /**
   * Runs an admin-protected call. On 401 `admin-token-required|invalid`:
   *
   * - if the token changed since this attempt was sent, retries with the
   *   current token without prompting;
   * - otherwise the sent token was rejected: it is cleared from memory and
   *   the user is asked (reason `admin-token-invalid` when a token had been
   *   sent, else the server's reason). An answer equal to the rejected token
   *   is treated as rejected and asked again (`admin-token-invalid`); any
   *   other answer is stored and the same call retried.
   *
   * Repeats until success or the user cancels (`null`/empty), in which case
   * the last 401 ApiError is rethrown and the token stays cleared. Callers
   * that hit a 401 while a prompt is open share it, and a cancel rejects
   * all of them. Without a registered prompt the 401 propagates.
   */
  async function withAdmin<T>(op: () => Promise<T>): Promise<T> {
    for (;;) {
      const sent = adminToken.value;
      try {
        return await op();
      } catch (err) {
        if (!isApiError(err) || !err.isAdminTokenError || !prompt) throw err;
        // A newer token was entered meanwhile: retry with it. (A token that
        // was cleared meanwhile was rejected for another caller: ask.)
        if (adminToken.value !== null && adminToken.value !== sent) continue;
        let reason = err.error as AdminTokenRequest['reason'];
        if (sent !== null) {
          adminToken.value = null;
          reason = 'admin-token-invalid';
        }
        let token = await ask(reason);
        while (token !== null && token === sent) token = await ask('admin-token-invalid');
        if (token === null) throw err;
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
