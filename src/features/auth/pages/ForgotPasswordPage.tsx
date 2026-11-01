import { useState, type FormEvent } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
import { PASSWORD_RESET_DISABLED_MESSAGE, PASSWORD_RESET_SENT_MESSAGE, isPasswordResetEnabled } from "@/features/auth/passwordReset";
import { BrandMark } from "@/shared/ui/BrandMark";
import { Button } from "@/shared/ui/Button";
import { TextField } from "@/shared/ui/Field";
import { AuthArt } from "./AuthArt";
import "./auth.css";

export function ForgotPasswordPage({ enabled = isPasswordResetEnabled() }: { enabled?: boolean }) {
  const navigate = useNavigate();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
    } catch {
      // The same message is shown for every address and every provider result so
      // the form never reveals whether an account exists.
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  }

  return (
    <main className="ef-auth ef-shell-bg">
      <AuthArt title="把知识连成一张可走的路" description="忘记密码时，我们会把恢复链接发送到你注册的邮箱。" />
      <form className="ef-auth-card ef-ui-glass ef-ui-glass--regular ef-ui-glass--r-24" onSubmit={submit} aria-labelledby="ef-forgot-title">
        <div className="ef-auth-brand"><BrandMark variant="brand" size={28} /><span>EduFlow</span></div>
        <h1 id="ef-forgot-title">重置密码</h1>
        {!enabled ? (
          <>
            <p className="ef-auth-sub">{PASSWORD_RESET_DISABLED_MESSAGE}</p>
            <Button className="ef-auth-submit" variant="secondary" icon={<ArrowLeft size={16} aria-hidden />} onClick={() => navigate("/login")}>返回登录</Button>
          </>
        ) : sent ? (
          <>
            <div className="ef-auth-success" role="status">
              <Mail size={18} aria-hidden />
              <span>{PASSWORD_RESET_SENT_MESSAGE}</span>
            </div>
            <p className="ef-auth-help">没收到？请检查垃圾邮件，稍后可重新发送。链接在 1 小时内有效。</p>
            <Button className="ef-auth-submit" variant="primary" onClick={() => navigate("/login")}>返回登录</Button>
          </>
        ) : (
          <>
            <p className="ef-auth-sub">输入注册邮箱，我们会发送一封包含重置链接的邮件。</p>
            <TextField label="邮箱" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" icon={<Mail size={16} aria-hidden />} placeholder="you@example.com" required />
            <Button className="ef-auth-submit" variant="primary" type="submit" loading={submitting}>发送重置邮件</Button>
            <p className="ef-auth-alt"><button type="button" onClick={() => navigate("/login")}>返回登录</button></p>
          </>
        )}
      </form>
    </main>
  );
}
