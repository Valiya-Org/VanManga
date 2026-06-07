import { http } from '@/api/http';
import type { ApiEnvelope, KavitaLoginData } from '@/types/manga';

/** 登录 Kavita 账户，成功返回 apiKey。 */
export async function kavitaLogin(
  username: string,
  password: string,
): Promise<ApiEnvelope<KavitaLoginData>> {
  const res = await http.post('kavita/login', { username, password });
  return res.data;
}

/** 检查服务器 Kavita 配置状态。 */
export async function kavitaStatus(): Promise<ApiEnvelope<unknown>> {
  const res = await http.get('kavita/status');
  return res.data;
}
