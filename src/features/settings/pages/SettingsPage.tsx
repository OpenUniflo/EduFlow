import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bell, KeyRound, Lock, MonitorSmartphone, Search, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { roleLabel } from "@/features/auth/roles";
import type { MockSession } from "@/features/auth/types";
import { Avatar, Button, Card, Pill, PreviewBadge, SegmentedControl, Switch, TextField, openCommandPalette } from "@/shared/ui";
import { updateDisplayName } from "../settingsApi";
import { validateDisplayName, validatePasswordChange } from "../model/settingsForm";
import type { ProfileVisibility, SettingsPreview } from "../model/settingsPreview";
import "./settingsPage.css";

type SettingsCategory = "account" | "notifications" | "privacy";

const CATEGORIES: Array<{ id: SettingsCategory; label: string; icon: typeof UserRound }> = [
  { id: "account", label: "账户", icon: UserRound },
  { id: "notifications", label: "通知", icon: Bell },
  { id: "privacy", label: "隐私", icon: ShieldCheck }
];

const VISIBILITY_OPTIONS: Array<{ value: ProfileVisibility; label: string; description: string }> = [
  { value: "private", label: "仅自己", description: "默认" },
  { value: "followers", label: "关注我的人", description: "单向关注" },
  { value: "organization", label: "本组织", description: "示例组织" },
  { value: "link", label: "拿到链接的人", description: "可撤销" }
];

const VISIBILITY_LABELS: Record<ProfileVisibility, string> = {
  private: "仅自己",
  followers: "关注我的人",
  organization: "本组织",
  link: "拿到链接的人"
};

function messageOf(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  return /[\u4e00-\u9fa5]/.test(message) ? message : fallback;
}

export type SettingsPageProps = {
  session: MockSession;
  preview: SettingsPreview;
  onDisplayNameChange?: (displayName: string) => void;
};

export function SettingsPage({ session, preview, onDisplayNameChange }: SettingsPageProps) {
  const { changePassword } = useAuth();
  const [active, setActive] = useState<SettingsCategory>("account");
  const accountRef = useRef<HTMLElement>(null);
  const notificationsRef = useRef<HTMLElement>(null);
  const privacyRef = useRef<HTMLElement>(null);
  const [displayName, setDisplayName] = useState(session.name);
  const [nameDraft, setNameDraft] = useState(session.name);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameError, setNameError] = useState("");
  const [nameStatus, setNameStatus] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [notifications, setNotifications] = useState(() => preview.notifications.map((item) => ({ ...item })));
  const [privacy, setPrivacy] = useState(() => ({ ...preview.privacy }));

  useEffect(() => {
    setDisplayName(session.name);
    setNameDraft(session.name);
  }, [session.name]);

  const role = roleLabel(session.role);
  const emailVerified = Boolean(session.emailVerified);

  function jumpTo(category: SettingsCategory) {
    setActive(category);
    const target = category === "account" ? accountRef.current : category === "notifications" ? notificationsRef.current : privacyRef.current;
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }

  async function saveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateDisplayName(nameDraft);
    if (validation) {
      setNameError(validation);
      return;
    }
    setNameError("");
    setNameStatus("");
    setSavingName(true);
    try {
      const saved = await updateDisplayName(nameDraft.trim());
      setDisplayName(saved);
      setNameDraft(saved);
      setNameEditing(false);
      setNameStatus("显示名称已保存。");
      onDisplayNameChange?.(saved);
    } catch (error) {
      setNameError(messageOf(error, "保存失败，请稍后重试。"));
    } finally {
      setSavingName(false);
    }
  }

  function cancelNameEdit() {
    setNameEditing(false);
    setNameDraft(displayName);
    setNameError("");
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validatePasswordChange({ currentPassword, newPassword, confirmPassword });
    if (validation) {
      setPasswordError(validation);
      return;
    }
    setPasswordError("");
    setPasswordStatus("");
    setChangingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setPasswordOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus("密码已更新，下次登录请使用新密码。");
    } catch (error) {
      setPasswordError(messageOf(error, "密码更新失败，请稍后重试。"));
    } finally {
      setChangingPassword(false);
    }
  }

  function cancelPasswordEdit() {
    setPasswordOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
  }

  return (
    <main className="ef-set-page">
      <header className="ef-set-head">
        <div className="ef-set-head-copy">
          <div className="ef-set-crumb"><span>设置</span><span aria-hidden="true">/</span><b>账户与偏好</b></div>
          <h1>设置</h1>
          <span className="ef-set-sub">{displayName} · {role}</span>
        </div>
        <div className="ef-set-head-actions">
          <Button
            size="32"
            variant="secondary"
            icon={<Search size={14} aria-hidden />}
            onClick={() => openCommandPalette({ source: "settings" })}
          >
            搜索设置 <kbd>⌘K</kbd>
          </Button>
        </div>
      </header>

      <div className="ef-set-grid">
        <nav className="ef-set-rail" aria-label="设置分类">
          {CATEGORIES.map((category) => {
            const Icon = category.icon;
            return (
              <button key={category.id} type="button" className={active === category.id ? "is-on" : ""} aria-current={active === category.id ? "true" : undefined} onClick={() => jumpTo(category.id)}>
                <Icon size={17} aria-hidden />
                {category.label}
              </button>
            );
          })}
        </nav>

        <div className="ef-set-content">
          <Card ref={accountRef} className="ef-set-card" id="settings-account" aria-labelledby="settings-account-title">
            <div className="ef-set-card-head">
              <h2 id="settings-account-title">账户</h2>
              <span>登录方式与角色</span>
            </div>
            <div className="ef-set-account">
              <Avatar name={displayName} size={40} personColor="me" decorative />
              <div className="ef-set-account-copy">
                <b>{displayName}</b>
                <span>{session.email} · {role}</span>
              </div>
              <Button size="32" variant="secondary" icon={<KeyRound size={14} aria-hidden />} onClick={() => { setPasswordOpen((value) => !value); setPasswordError(""); setPasswordStatus(""); }}>
                修改密码
              </Button>
            </div>
            <div className="ef-set-rows">
              {nameEditing ? (
                <form className="ef-set-name-form" onSubmit={saveDisplayName} aria-label="编辑显示名称">
                  <TextField
                    label="显示名称"
                    value={nameDraft}
                    onChange={(event) => { setNameDraft(event.target.value); setNameError(""); }}
                    autoFocus
                    maxLength={40}
                    error={nameError || undefined}
                    hint="仅自己可修改，保存后立即生效"
                  />
                  <div className="ef-set-form-actions">
                    <Button size="32" variant="ghost" onClick={cancelNameEdit}>取消</Button>
                    <Button size="32" variant="primary" type="submit" loading={savingName}>保存</Button>
                  </div>
                </form>
              ) : (
                <div className="ef-set-row">
                  <div className="ef-set-row-copy"><b>显示名称</b><span>{displayName}</span></div>
                  <Button size="32" variant="ghost" onClick={() => { setNameEditing(true); setNameDraft(displayName); setNameError(""); setNameStatus(""); }}>编辑</Button>
                </div>
              )}
              <div className="ef-set-row">
                <div className="ef-set-row-copy"><b>邮箱</b><span>{session.email}</span></div>
                <Pill tone={emailVerified ? "ok" : "warn"}>{emailVerified ? "已验证" : "未验证"}</Pill>
              </div>
            </div>
            {nameStatus ? <p className="ef-set-status" role="status">{nameStatus}</p> : null}
            {passwordStatus ? <p className="ef-set-status" role="status">{passwordStatus}</p> : null}
            {passwordOpen ? (
              <form className="ef-set-password" onSubmit={submitPassword} aria-label="修改密码">
                <div className="ef-set-subhead"><b>修改密码</b><span>先用当前密码重新验证身份</span></div>
                <div className="ef-set-password-fields">
                  <TextField label="当前密码" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); setPasswordError(""); }} required />
                  <TextField label="新密码" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setPasswordError(""); }} hint="至少 8 位，包含字母和数字" required />
                  <TextField label="确认新密码" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setPasswordError(""); }} required />
                </div>
                {passwordError ? <p className="ef-set-error" role="alert">{passwordError}</p> : null}
                <div className="ef-set-form-actions">
                  <Button size="32" variant="ghost" onClick={cancelPasswordEdit}>取消</Button>
                  <Button size="32" variant="primary" type="submit" loading={changingPassword}>更新密码</Button>
                </div>
              </form>
            ) : null}
          </Card>

          <Card className="ef-set-card" id="settings-devices" aria-labelledby="settings-devices-title" data-preview="sample">
            <div className="ef-set-card-head">
              <h2 id="settings-devices-title">登录设备</h2>
              <PreviewBadge />
            </div>
            <div className="ef-set-rows">
              {preview.devices.map((device) => (
                <div className="ef-set-row" key={device.id}>
                  <div className="ef-set-device-icon"><MonitorSmartphone size={18} aria-hidden /></div>
                  <div className="ef-set-row-copy"><b>{device.name}</b><span>{device.detail}</span></div>
                  <Pill tone={device.current ? "ok" : "quiet"}>{device.current ? "当前设备" : "示例设备"}</Pill>
                </div>
              ))}
            </div>
          </Card>

          <Card ref={notificationsRef} className="ef-set-card" id="settings-notifications" aria-labelledby="settings-notifications-title" data-preview="sample">
            <div className="ef-set-card-head">
              <h2 id="settings-notifications-title">通知</h2>
              <PreviewBadge />
            </div>
            <div className="ef-set-rows">
              {notifications.map((item) => (
                <div className="ef-set-row" key={item.id}>
                  <div className="ef-set-row-copy"><b>{item.label}</b><span>{item.description}</span></div>
                  <Switch label={item.label} checked={item.enabled} onChange={(checked) => setNotifications((list) => list.map((entry) => entry.id === item.id ? { ...entry, enabled: checked } : entry))} />
                </div>
              ))}
            </div>
            <p className="ef-set-preview-note"><Lock size={12} aria-hidden />预览开关只改变本页显示，不会保存，也不会发出请求。</p>
          </Card>

          <Card ref={privacyRef} className="ef-set-card" id="settings-privacy" aria-labelledby="settings-privacy-title" data-preview="sample">
            <div className="ef-set-card-head">
              <h2 id="settings-privacy-title">隐私</h2>
              <PreviewBadge />
            </div>
            <div className="ef-set-row">
              <div className="ef-set-row-copy"><b>档案可见范围</b><span>控制谁能看到你的学习进度与作品</span></div>
              <Pill tone="quiet">{VISIBILITY_LABELS[privacy.visibility]}</Pill>
            </div>
            <SegmentedControl cards label="档案可见范围" value={privacy.visibility} options={VISIBILITY_OPTIONS} onChange={(visibility) => setPrivacy((value) => ({ ...value, visibility }))} />
            <div className="ef-set-rows">
              {([
                ["learningProgress", "学习进度", "已学 / 在学节点与课程进度"],
                ["works", "作品与实践成果", "工作流、提交与评价结论"],
                ["heatmap", "学习热力图", "按天的学习活动"],
                ["capabilityOverview", "能力概览", "按领域的能力分布"]
              ] as const).map(([key, label, description]) => (
                <div className="ef-set-row" key={key}>
                  <div className="ef-set-row-copy"><b>{label}</b><span>{description}</span></div>
                  <Switch label={label} checked={privacy[key]} onChange={(checked) => setPrivacy((value) => ({ ...value, [key]: checked }))} />
                </div>
              ))}
            </div>
            <div className="ef-set-never">
              <Lock size={14} aria-hidden />
              <span><b>永不展示：</b>分数、失败尝试、对话内容、AI 评价细节、未完成提交。分享链接可以随时撤销。</span>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
