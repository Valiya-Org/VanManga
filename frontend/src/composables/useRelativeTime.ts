import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Chinese relative time for a unix-seconds timestamp:
 * 刚刚 / n 分钟前 / n 小时前 / 昨天 / n 天前 / 上周 / yyyy-MM-dd.
 * Day-level steps count calendar days in local time; a future time (clock
 * skew) reads as 刚刚.
 */
export function formatRelativeTime(unixSeconds: number, now: number = Date.now()): string {
  const at = unixSeconds * 1000;
  const diff = now - at;
  if (diff < MINUTE) return '刚刚';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  if (diff < 24 * HOUR) return `${Math.floor(diff / HOUR)} 小时前`;
  const days = Math.round((startOfDay(now) - startOfDay(at)) / (24 * HOUR));
  if (days <= 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  if (days < 14) return '上周';
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Shared clock: one timer for every caller, ticking once a minute. */
const now = ref(Date.now());
let users = 0;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Reactive relative-time formatter. `relative(sec)` re-evaluates every
 * minute while any component using it is mounted.
 */
export function useRelativeTime(): {
  now: Ref<number>;
  relative: (unixSeconds: number) => string;
} {
  if (getCurrentScope()) {
    users += 1;
    if (!timer) {
      now.value = Date.now();
      timer = setInterval(() => (now.value = Date.now()), MINUTE);
    }
    onScopeDispose(() => {
      users -= 1;
      if (users === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    });
  }
  return { now, relative: (sec) => formatRelativeTime(sec, now.value) };
}
