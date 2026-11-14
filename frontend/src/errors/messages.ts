import { isApiError } from '@/api/errors';
import type {
  ApiErrorCode,
  CLIENT_ERROR_CODES,
  DEFAULT_ERROR_CODES,
} from '@/api/types';

type KnownCode =
  | ApiErrorCode
  | (typeof DEFAULT_ERROR_CODES)[number]
  | (typeof CLIENT_ERROR_CODES)[number];

/**
 * The single place that turns an `error` code into user-facing Chinese
 * text. Keyed on the machine-readable code only — server `message` text is
 * English debugging output and is never shown.
 */
export const ERROR_MESSAGES: Record<KnownCode, string> = {
  // 400
  'validation-failed': '请求参数不正确',
  'query-required': '请输入搜索关键词',
  'bad-request': '请求无效',
  // 401
  'admin-token-required': '此操作需要管理员口令',
  'admin-token-invalid': '管理员口令不正确',
  unauthorized: '未授权的请求',
  // 403
  'kavita-login-failed': 'Kavita 用户名或密码错误',
  'kavita-refresh-failed': 'Kavita 登录已失效，请重新登录',
  forbidden: '没有权限执行此操作',
  // 404
  'not-found': '请求的资源不存在',
  'manga-not-found': '漫画库中没有这部漫画',
  'unknown-source': '不支持的漫画源',
  'thumbnail-not-found': '封面不存在或已过期',
  'kavita-disabled': '服务器未配置 Kavita',
  // 409
  'manga-busy': '这部漫画正在下载或排队中，请稍后再试',
  'already-in-library': '这部漫画已在库中',
  duplicate: '库中已有名字相近的漫画',
  conflict: '操作冲突，请刷新后重试',
  // 410
  'search-expired': '搜索结果已过期，请重新搜索',
  // 413
  'payload-too-large': '提交的内容过大',
  // 429
  'rate-limited': '源站限流，请稍后再试',
  // 451
  dmca: '该漫画已因 DMCA 被源站下架',
  // 500
  'delete-failed': '删除下载目录失败，漫画记录已保留',
  'internal-error': '服务器内部错误',
  // 502
  'scraper-failed': '抓取源站失败，请稍后再试',
  'scraper-blocked': '源站拦截了请求（Cloudflare），请稍后再试',
  'kavita-unreachable': '无法连接 Kavita',
  // client-side
  'network-error': '无法连接服务器，请检查网络',
  'invalid-response': '服务器返回了无法识别的内容',
};

export const FALLBACK_MESSAGE = '操作失败，请稍后重试';

/**
 * User-facing Chinese text for any thrown value. Returns `''` for a
 * cancelled request (`isCanceled(err)`), which must not be shown at all.
 */
export function errorMessage(err: unknown): string {
  if (!isApiError(err)) return FALLBACK_MESSAGE;
  if (err.isCanceled) return '';
  const known = (ERROR_MESSAGES as Record<string, string | undefined>)[err.error];
  if (known) return known;
  if (err.status >= 502 && err.status <= 504) return ERROR_MESSAGES['network-error'];
  if (err.status >= 500) return ERROR_MESSAGES['internal-error'];
  if (err.status >= 400) return ERROR_MESSAGES['bad-request'];
  return FALLBACK_MESSAGE;
}
