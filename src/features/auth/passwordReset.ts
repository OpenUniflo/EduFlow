const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/**
 * Hosted environments have no outbound mail service, so the reset entry stays
 * hidden unless the deployment explicitly enables it. Local Supabase defaults on.
 */
export function isPasswordResetEnabled(explicit = import.meta.env.VITE_AUTH_PASSWORD_RESET_ENABLED as string | undefined, supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined): boolean {
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  if (!supabaseUrl) return false;
  try {
    return LOCAL_HOSTS.has(new URL(supabaseUrl).hostname);
  } catch {
    return false;
  }
}

export const PASSWORD_RESET_SENT_MESSAGE = "如果该邮箱已注册，重置邮件已发送，请查收。";
export const PASSWORD_RESET_DISABLED_MESSAGE = "密码重置尚未开放：当前环境没有配置发信服务。";
export const PASSWORD_RESET_INVALID_MESSAGE = "恢复链接无效或已过期，请重新申请重置邮件。";
