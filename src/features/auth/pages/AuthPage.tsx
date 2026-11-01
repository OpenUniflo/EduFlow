import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
import { resolveAuthRedirect } from "@/features/auth/authRedirect";
import { isPasswordResetEnabled } from "@/features/auth/passwordReset";
import { API_AUTHENTICATION_FAILURE_TTL_MS, getApiAuthenticationFailure, subscribeApiAuthenticationFailure } from "@/shared/api/apiClient";
import { BrandMark } from "@/shared/ui/BrandMark";
import { Button } from "@/shared/ui/Button";
import { TextField } from "@/shared/ui/Field";
import { AuthArt } from "./AuthArt";
import "./auth.css";

function passwordScore(value: string) {
  return [value.length >= 8, /[a-z]/i.test(value), /\d/.test(value), /[^a-z0-9]/i.test(value)].filter(Boolean).length;
}

function strengthLabel(score: number) {
  return score >= 4 ? "强" : score >= 3 ? "中" : score >= 2 ? "弱" : "太短";
}

function ReturnHint({ destination }: { destination: string | null }) {
  return (
    <div className="ef-auth-return">
      <BookOpen size={15} aria-hidden />
      <span>{destination ? "登录后回到刚才的页面" : "登录后进入你的学习空间"}</span>
    </div>
  );
}

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authenticationFailure, setAuthenticationFailure] = useState(getApiAuthenticationFailure);
  const isRegister = mode === "register";
  const destination = location.state ? resolveAuthRedirect(location.state) : null;
  const notice = !isRegister && location.state && typeof location.state === "object" && "notice" in location.state && typeof location.state.notice === "string" ? location.state.notice : "";
  const passwordResetEnabled = isPasswordResetEnabled();
  const score = passwordScore(password);

  useEffect(() => {
    const unsubscribe = subscribeApiAuthenticationFailure(setAuthenticationFailure);
    setAuthenticationFailure(getApiAuthenticationFailure());
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (!authenticationFailure) return;
    const timer = setTimeout(() => setAuthenticationFailure(getApiAuthenticationFailure()), Math.max(0, authenticationFailure.occurredAt + API_AUTHENTICATION_FAILURE_TTL_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [authenticationFailure]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (isRegister) {
        const result = await signUp({ name: name.trim() || "新同学", email: email.trim(), password });
        if (result.confirmationRequired) setError("注册成功，请先在邮箱中确认账号后再登录。");
      } else {
        await signIn({ email: email.trim(), password });
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "认证失败，请重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="ef-auth ef-shell-bg">
      <AuthArt
        title={isRegister ? "从一个目标开始" : "把知识连成一张可走的路"}
        description={isRegister ? "告诉 EduFlow 你想做成什么，它会帮你找到课程、补齐前置知识。" : "在档案里看清自己学过什么，在对话里决定下一步。"}
      />

      <form className="ef-auth-card ef-ui-glass ef-ui-glass--regular ef-ui-glass--r-24" onSubmit={submit} aria-labelledby="ef-auth-title">
        <div className="ef-auth-brand">
          <BrandMark variant="brand" size={28} />
          <span>EduFlow</span>
        </div>
        <h1 id="ef-auth-title">{isRegister ? "创建账号" : "登录"}</h1>
        <p className="ef-auth-sub">{isRegister ? "注册后会保存学习进度、作品和路线。" : "继续你的学习路线。"}</p>
        {notice ? <div className="ef-auth-success" role="status">{notice}</div> : null}
        {!isRegister && authenticationFailure ? (
          <div className="ef-auth-alert" role="alert" aria-label="登录状态提醒">
            <strong>登录状态已失效</strong>
            <span>刚才的请求未能完成。请重新登录后确认原操作状态，避免重复提交。</span>
            <small>HTTP 401{authenticationFailure.requestId ? ` · 请求编号：${authenticationFailure.requestId}` : ""}</small>
          </div>
        ) : null}
        {!isRegister ? <ReturnHint destination={destination} /> : null}
        {isRegister ? (
          <TextField
            label="称呼"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            icon={<UserRound size={16} aria-hidden />}
            placeholder="怎么称呼你"
          />
        ) : null}
        <TextField
          label="邮箱"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          icon={<Mail size={16} aria-hidden />}
          placeholder="you@example.com"
          required
        />
        <div className="ef-auth-password">
          <TextField
            label="密码"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={isRegister ? "new-password" : "current-password"}
            icon={<LockKeyhole size={16} aria-hidden />}
            placeholder={isRegister ? "至少 8 位，包含字母和数字" : "输入密码"}
            minLength={isRegister ? 8 : 6}
            required
            error={isRegister ? undefined : error || undefined}
            trailing={(
              <Button
                variant="ghost"
                size="32"
                type="button"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                icon={showPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                onClick={() => setShowPassword((value) => !value)}
              />
            )}
          />
          {isRegister ? (
            <>
              <div className="ef-auth-strength" aria-label={`密码强度：${strengthLabel(score)}`}>
                {[1, 2, 3, 4].map((step) => <i key={step} className={step <= score ? "is-on" : ""} />)}
              </div>
              <span className="ef-auth-help">至少 8 位，包含字母和数字</span>
            </>
          ) : null}
        </div>
        {!isRegister && passwordResetEnabled ? (
          <div className="ef-auth-forgot"><button type="button" onClick={() => navigate("/forgot-password")}>忘记密码？</button></div>
        ) : null}
        {isRegister ? (
          <label className="ef-auth-check">
            <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} required />
            <span>我已阅读并同意《用户协议》和《隐私政策》</span>
          </label>
        ) : null}
        {isRegister && error ? <p className="ef-auth-error" role="alert">{error}</p> : null}
        <Button className="ef-auth-submit" variant="primary" type="submit" loading={submitting}>
          {submitting ? "请稍候…" : isRegister ? "注册并开始" : "登录"}
        </Button>
        <p className="ef-auth-alt">
          {isRegister ? "已有账号？" : "还没有账号？"}
          <button type="button" onClick={() => navigate(isRegister ? "/login" : "/register", { state: location.state })}>
            {isRegister ? "登录" : "注册"}
          </button>
        </p>
      </form>
    </main>
  );
}
