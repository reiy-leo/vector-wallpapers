/** /api/me 的响应体 —— Worker 与前端共用的契约。 */
export interface MeResponse {
  user: { email: string; name: string | null; picture: string | null } | null;
  authMode: 'google' | 'unconfigured' | 'disabled';
  /** 会话邮箱在 ADMIN_EMAILS 里（批改模式开关只对管理员显示）。旧 Worker 不返回该字段 = false。 */
  admin?: boolean;
}

/** /auth/callback 失败时回跳 `/?login_error=<code>`，前端据此给出中文提示。 */
export const LOGIN_ERROR_TEXT: Record<string, string> = {
  denied: '已取消 Google 登录。',
  state: '登录会话已过期，请重新登录。',
  token: 'Google 登录失败，请稍后再试。',
  id_token: 'Google 返回的身份信息无效，请重新登录。',
  unverified: '该 Google 账号的邮箱尚未验证。',
  domain: '该邮箱域名不在允许登录的范围内。',
  unconfigured: '站点尚未配置 Google 登录。',
};
