import { useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound, MailWarning } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
import { PASSWORD_RESET_DISABLED_MESSAGE, PASSWORD_RESET_INVALID_MESSAGE, isPasswordResetEnabled } from "@/features/auth/passwordReset";
import { validateNewPassword } from "@/features/settings/model/settingsForm";
import { passwordRecoveryRequested } from "@/shared/api/supabaseClient";
import { BrandMark } from "@/shared/ui/BrandMark";
import { Button } from "@/shared/ui/Button";
import { TextField } from "@/shared/ui/Field";
import { AuthArt } from "./AuthArt";
import "./auth.css";

export function ResetPasswordPage({ enabled = isPasswordResetEnabled() }: { enabled?: boolean }) {
  const navigate = useNavigate();
  const { session, updatePassword, logout } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [updated, setUpdated] = useState(false);

  const recoveryReady = enabled && passwordRecoveryRequested && Boolean(session);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateNewPassword(newPassword, confirmPassword);
    if (validation) {
      setError(validation);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await updatePassword(newPassword);
      setUpdated(true);
      await Promise.resolve(logout());
      navigate("/login", { replace: true, state: { notice: "密码已更新，请用新密码登录。" } });
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "";
      setError(/[\u4e00-\u9fa5]/.test(message) ? message : "密码更新失败，请重新申请重置邮件。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="ef-auth ef-shell-bg">
      <AuthArt title="把知识连成一张可走的路" description="设置新密码后，回到登录页继续你的学习路线。" />
      <section className="ef-auth-card ef-ui-glass ef-ui-glass--regular ef-ui-glass--r-24" aria-labelledby="ef-reset-title">
        <div className="ef-auth-brand"><BrandMark variant="brand" size={28} /><span>EduFlow</span></div>
        <h1 id="ef-reset-title">设置新密码</h1>
        {!enabled ? (
          <>
            <div className="ef-auth-alert" role="alert"><MailWarning size={18} aria-hidden /><span>{PASSWORD_RESET_DISABLED_MESSAGE}</span></div>
            <Button className="ef-auth-submit" variant="secondary" icon={<ArrowLeft size={16} aria-hidden />} onClick={() => navigate("/login")}>返回登录</Button>
          </>
        ) : !recoveryReady ? (
          <>
            <div className="ef-auth-alert" role="alert"><MailWarning size={18} aria-hidden /><span>{PASSWORD_RESET_INVALID_MESSAGE}</span></div>
            <Button className="ef-auth-submit" variant="secondary" icon={<ArrowLeft size={16} aria-hidden />} onClick={() => navigate("/login")}>返回登录</Button>
          </>
        ) : (
          <form className="ef-auth-reset" onSubmit={submit}>
            <p className="ef-auth-sub">恢复会话已验证。请输入两次相同的新密码。</p>
            <TextField label="新密码" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setError(""); }} icon={<KeyRound size={16} aria-hidden />} hint="至少 8 位，包含字母和数字" required />
            <TextField label="确认新密码" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError(""); }} icon={<KeyRound size={16} aria-hidden />} required />
            {error ? <p className="ef-auth-error" role="alert">{error}</p> : null}
            {updated ? <p className="ef-auth-success" role="status">密码已更新，正在返回登录…</p> : null}
            <Button className="ef-auth-submit" variant="primary" type="submit" loading={submitting}>更新密码</Button>
            <p className="ef-auth-alt"><button type="button" onClick={() => navigate("/login")}>返回登录</button></p>
          </form>
        )}
      </section>
    </main>
  );
}
