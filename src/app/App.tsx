import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Navigate, Route as RouterRoute, Routes, useLocation, useMatch, useNavigate } from "react-router-dom";
import { Network } from "lucide-react";
import { AuthProvider } from "@/features/auth/AuthContext";
import type { MockSession } from "@/features/auth/types";
import { canManageCourses, canManageKnowledgeDomains } from "@/features/auth/capabilities";
import { AuthPage } from "@/features/auth/pages/AuthPage";
import { ForgotPasswordPage } from "@/features/auth/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/features/auth/pages/ResetPasswordPage";
import { isPasswordResetEnabled } from "@/features/auth/passwordReset";
import { AppChrome } from "@/app/components/AppChrome";
import { GlobalCommandPalette } from "@/app/components/GlobalCommandPalette";
import { NotFoundPage } from "@/app/pages/PlaceholderPages";
import { EMPTY_SETTINGS_PREVIEW } from "@/features/settings/model/settingsForm";
import { PublicHomePage } from "@/app/pages/PublicHomePage";
import { applicationServices, hydrateApplicationServices, hydratePublicApplicationServices, resetAuthenticatedApplicationServices } from "@/app/services/applicationServices";
import { resolveWorkflowAssignmentContext } from "@/app/integrations/workflowAssignmentIntegration";
import { LearningPage } from "@/features/learning/pages/LearningPage";
import { MicroLearningExperience } from "@/features/learning/micro/MicroLearningExperience";
import { retireLegacyWorkflowStorage } from "@/features/workflow/editor/v2/retireLegacyStorage";
import type { WorkflowEditorFocus } from "@/features/workflow/domain/v2/types";
import { supabaseClient } from "@/shared/api/supabaseClient";
import { resolveLegacyRoute } from "@/app/legacyRoutes";
import { ApiRequestError } from "@/shared/api/apiClient";
import { CapabilityEvidenceBoundary } from "@/app/integrations/CapabilityEvidenceBoundary";
import { AssistantRuntimeProvider } from "@/features/assistant/AssistantRuntimeContext";
import { authGateState, resolveAuthRedirect } from "@/features/auth/authRedirect";
import { Button } from "@/shared/ui/Button";
import { ResourceCenterDialog } from "@/features/workflow/resources/ResourceCenterDialog";
import type { McpTab } from "@/features/workflow/resources/mcpMarketModel";
import { cleanMcpOAuthSearch, closeCurrentOAuthWindow, isMcpOAuthPopupReturn, notifyMcpOAuthResult, readMcpOAuthWindowResult } from "@/features/workflow/resources/mcpOAuthWindow";
import { workflowApiV2 } from "@/features/workflow/application/v2/useWorkflowV2Controller";
import { McpOAuthWindowResult } from "@/app/components/McpOAuthWindowResult";

const AdminPage = lazy(() => import("@/features/admin/AdminPage").then(module => ({ default: module.AdminPage })));
const ArchivePage = lazy(() => import("@/features/archive/pages/ArchivePage").then(module => ({ default: module.ArchivePage })));
const AssignmentExperiencePage = lazy(() => import("@/features/course/pages/AssignmentExperiencePage").then(module => ({ default: module.AssignmentExperiencePage })));
const CourseCreationWorkspacePage = lazy(() => import("@/features/course/pages/CourseCreationWorkspacePage").then(module => ({ default: module.CourseCreationWorkspacePage })));
const CourseGraphPage = lazy(() => import("@/features/course/pages/CourseGraphPage").then(module => ({ default: module.CourseGraphPage })));
const CourseManagementPage = lazy(() => import("@/features/course/pages/CourseManagementPage").then(module => ({ default: module.CourseManagementPage })));
const LessonPage = lazy(() => import("@/features/material/pages/LessonPage").then(module => ({ default: module.LessonPage })));
const RecordsPage = lazy(() => import("@/features/records/pages/RecordsPage").then(module => ({ default: module.RecordsPage })));
const SettingsPage = lazy(() => import("@/features/settings/pages/SettingsPage").then(module => ({ default: module.SettingsPage })));
const WorkflowLibraryPage = lazy(() => import("@/features/workflow/pages/WorkflowLibraryPage").then(module => ({ default: module.WorkflowLibraryPage })));
const WorkflowV2Route = lazy(() => import("@/features/workflow/pages/WorkflowV2Entry").then(module => ({ default: module.WorkflowV2Route })));

type GlobalResources = { tab: McpTab; focusRef: string; notice: string };

function GlobalResourceCenter({ view, onClose, onOpenReference }: { view: GlobalResources | null; onClose: () => void; onOpenReference: (workflowId: string) => void }) {
  const [environmentRef, setEnvironmentRef] = useState("");
  const [environmentLoading, setEnvironmentLoading] = useState(false);
  const [error, setError] = useState("");
  const [environmentAttempt, setEnvironmentAttempt] = useState(0);
  useEffect(() => {
    if (!view) { setEnvironmentRef(""); setEnvironmentLoading(false); setError(""); return; }
    let active = true;
    setEnvironmentRef(""); setEnvironmentLoading(true); setError("");
    workflowApiV2.environments()
      .then(result => { if (active) setEnvironmentRef(result.items[0]?.environmentRef ?? ""); })
      .catch(() => { if (active) setError("工作流服务暂时不可用，无法读取资源目录。"); })
      .finally(() => { if (active) setEnvironmentLoading(false); });
    return () => { active = false; };
  }, [view, environmentAttempt]);
  if (!view) return null;
  return <ResourceCenterDialog
    open
    environmentRef={environmentRef}
    environmentLoading={environmentLoading}
    environmentError={error}
    onRetryEnvironment={() => setEnvironmentAttempt(value => value + 1)}
    initialSection="mcp"
    initialMcpTab={view.tab}
    focusMcpRef={view.focusRef}
    notice={view.notice}
    onClose={onClose}
    onOpenReference={(row) => { onClose(); onOpenReference(row.workflowId); }}
    onResourcesChanged={() => undefined}
  />;
}

function workflowFocusFromState(state: unknown): WorkflowEditorFocus | undefined {
  if (!state || typeof state !== "object") return undefined;
  const value = (state as { workflowFocus?: unknown }).workflowFocus;
  if (!value || typeof value !== "object") return undefined;
  const { nodeId, graphPath } = value as { nodeId?: unknown; graphPath?: unknown };
  if (typeof nodeId !== "string" || !nodeId || nodeId.length > 200) return undefined;
  if (!Array.isArray(graphPath) || graphPath.length > 8) return undefined;
  if (!graphPath.every(segment => typeof segment === "string" && segment.length > 0 && segment.length <= 200)) return undefined;
  return { nodeId, graphPath: graphPath as string[] };
}

const passwordResetEnabled = isPasswordResetEnabled();

function AssistantRuntimeBoundary({ session, children }: { session: MockSession | null; children: ReactNode }) {
  return session ? <AssistantRuntimeProvider session={session}><CapabilityEvidenceBoundary session={session}>{children}</CapabilityEvidenceBoundary></AssistantRuntimeProvider> : children;
}

function LegacyRedirect() {
  const location = useLocation();
  const target = resolveLegacyRoute(location.pathname, location.search);
  return <Navigate to={`${target}${location.hash}`} replace />;
}

function ConnectionScreen({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  return (
    <main className="ef-connection ef-shell-bg">
      <section className="ef-connection-card ef-ui-glass ef-ui-glass--regular ef-ui-glass--r-24">
        <Network size={28} aria-hidden />
        <h1>{error ? "数据连接失败" : "正在连接 EduFlow…"}</h1>
        <p>{error ?? "正在读取公开学习内容与你的学习状态。"}</p>
        {error && onRetry ? <Button variant="primary" onClick={onRetry}>重新加载</Button> : null}
      </section>
    </main>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeWorkflowId = useMatch("/works/:id")?.params.id;
  const [session, setSession] = useState<MockSession | null>(null);
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [globalResources, setGlobalResources] = useState<GlobalResources | null>(null);
  const workflowFocus = useMemo(() => workflowFocusFromState(location.state), [location.state]);
  const oauthWindowResult = useMemo(() => {
    const result = readMcpOAuthWindowResult(location.search);
    return result?.popup ? result : null;
  }, [location.search]);
  const notifiedOAuthRef = useRef(false);

  useEffect(() => {
    // The authorization window only needs to announce the callback result and
    // close; it must not hydrate authenticated product services or routes.
    if (typeof window !== "undefined" && isMcpOAuthPopupReturn(window.location.search)) {
      setReady(true);
      return;
    }
    try { retireLegacyWorkflowStorage(localStorage); } catch { /* Storage may be unavailable; no runtime reads old keys. */ }
    let active = true;
    async function restore() {
      const { data } = await supabaseClient.auth.getSession();
      const authSession = data.session;
      if (!active) return;
      try {
        await hydratePublicApplicationServices();
        if (!authSession) return;
        const profile = await hydrateApplicationServices(authSession.user.id);
        if (!active) return;
        const name = profile.displayName || authSession.user.email?.split("@")[0] || "学习者";
        setSession({ userId: authSession.user.id, name, email: authSession.user.email ?? "", role: profile.role, capabilities: profile.capabilities, createdAt: authSession.user.created_at, emailVerified: Boolean(authSession.user.email_confirmed_at) });
      } catch (error) {
        console.error("Post-login application initialization failed", error);
        if (authSession && error instanceof ApiRequestError && error.status === 401) {
          resetAuthenticatedApplicationServices();
          setSession(null);
          await hydratePublicApplicationServices();
          if (active) navigate("/login", { replace: true, state: authGateState(location) });
        } else {
          setStartupError("部分学习数据加载失败，请重试。");
        }
      } finally {
        setReady(true);
      }
    }
    void restore();
    const { data } = supabaseClient.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && active) {
        resetAuthenticatedApplicationServices();
        setSession(null);
        void hydratePublicApplicationServices().catch((error) => { console.error("Public catalog rehydration failed", error); setStartupError("公开学习内容加载失败，请重试。"); });
      }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  const assignmentContext = useMemo(
    () => routeWorkflowId && !oauthWindowResult ? resolveWorkflowAssignmentContext(applicationServices.courseRepository, routeWorkflowId, location.search) : null,
    [location.search, routeWorkflowId, ready, oauthWindowResult]
  );
  useEffect(() => {
    if (!oauthWindowResult || typeof window === "undefined") return;
    if (!notifiedOAuthRef.current) {
      notifiedOAuthRef.current = true;
      // The notification is only a wake-up signal. The original tab verifies
      // the connection against the server catalog before changing any state.
      notifyMcpOAuthResult(oauthWindowResult);
      const clean = cleanMcpOAuthSearch(window.location.search);
      try { window.history.replaceState(window.history.state, "", `${window.location.pathname}${clean}${window.location.hash}`); } catch { /* URL cleanup is best effort. */ }
    }
    const closeTimer = window.setTimeout(() => {
      // Mobile tabs and iframe callbacks may refuse to close; the result screen remains.
      closeCurrentOAuthWindow();
    }, 1200);
    return () => window.clearTimeout(closeTimer);
  }, [oauthWindowResult]);
  useEffect(() => {
    if (!ready || oauthWindowResult) return;
    const params = new URLSearchParams(location.search);
    const outcome = params.get("mcpOAuth");
    if (!outcome) return;
    const ref = params.get("ref") ?? "";
    const message = params.get("message") ?? "";
    const toolCount = params.get("tools") ?? "";
    setGlobalResources({
      tab: "connected", focusRef: ref,
      notice: outcome === "success"
        ? `OAuth 授权完成${ref ? `：${ref}` : ""}${toolCount ? ` · 服务端返回 ${toolCount} 个工具` : ""}。连接已保存。`
        : outcome === "pending"
          ? `OAuth 已授权${ref ? `：${ref}` : ""}${toolCount ? ` · 服务端返回 ${toolCount} 个工具` : ""}。${message || "请明确选择允许使用的工具。"}`
          : `OAuth 连接未完成${message ? `：${message}` : ""}。可以重新尝试或改用 API Key。`,
    });
    const clean = cleanMcpOAuthSearch(location.search);
    navigate({ pathname: location.pathname, search: clean ? clean.slice(1) : "" }, { replace: true });
  }, [ready, location.pathname, location.search, navigate, oauthWindowResult]);

  async function logout() {
    await Promise.all([
      (applicationServices.learningProgressRepository as { flush?: () => Promise<unknown> }).flush?.()
    ]);
    await supabaseClient.auth.signOut();
    setSession(null);
    navigate("/", { replace: true });
  }

  async function signIn(input: { email: string; password: string }) {
    const { data, error } = await supabaseClient.auth.signInWithPassword(input);
    if (error || !data.session) {
      console.error("Authentication failed", error);
      const invalidCredentials = error?.code === "invalid_credentials" || error?.message === "Invalid login credentials";
      throw new Error(invalidCredentials ? "邮箱或密码错误，请检查后重试。" : "登录失败，请稍后重试。");
    }
    let profile: Awaited<ReturnType<typeof hydrateApplicationServices>>;
    try {
      profile = await hydrateApplicationServices(data.user.id);
    } catch (initializationError) {
      console.error("Post-login application initialization failed", initializationError);
      setStartupError("部分学习数据加载失败，请重试。");
      return;
    }
    const name = profile.displayName || data.user.email?.split("@")[0] || "学习者";
    setSession({ userId: data.user.id, name, email: data.user.email ?? "", role: profile.role, capabilities: profile.capabilities, createdAt: data.user.created_at, emailVerified: Boolean(data.user.email_confirmed_at) });
    navigate(resolveAuthRedirect(location.state), { replace: true });
  }

  async function signUp(input: { name: string; email: string; password: string }) {
    const { data, error } = await supabaseClient.auth.signUp({ email: input.email, password: input.password, options: { data: { display_name: input.name } } });
    if (error) throw new Error(error.message);
    if (!data.session) return { confirmationRequired: true };
    await signIn({ email: input.email, password: input.password });
    return { confirmationRequired: false };
  }

  async function changePassword(input: { currentPassword: string; newPassword: string }) {
    if (!session) throw new Error("登录状态已失效，请重新登录。");
    // Re-verify the current password before allowing the update.
    const { error: verifyError } = await supabaseClient.auth.signInWithPassword({ email: session.email, password: input.currentPassword });
    if (verifyError) throw new Error("当前密码不正确，请重新输入。");
    const { error } = await supabaseClient.auth.updateUser({ password: input.newPassword });
    if (error) throw new Error("密码更新失败，请稍后重试。");
  }

  async function requestPasswordReset(email: string) {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    if (error) throw new Error("重置邮件发送失败，请稍后重试。");
  }

  async function updatePassword(newPassword: string) {
    if (!session) throw new Error("恢复会话已失效，请重新申请重置邮件。");
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) throw new Error("密码更新失败，请重新申请重置邮件。");
  }

  async function reloadArchiveData() {
    await hydratePublicApplicationServices();
    if (session) await hydrateApplicationServices(session.userId);
  }

  async function retryStartup() {
    setReady(false);
    setStartupError("");
    try {
      const { data } = await supabaseClient.auth.getSession();
      await hydratePublicApplicationServices();
      if (!data.session) { setSession(null); return; }
      const profile = await hydrateApplicationServices(data.session.user.id);
      const name = profile.displayName || data.session.user.email?.split("@")[0] || "学习者";
      setSession({ userId: data.session.user.id, name, email: data.session.user.email ?? "", role: profile.role, capabilities: profile.capabilities, createdAt: data.session.user.created_at, emailVerified: Boolean(data.session.user.email_confirmed_at) });
    } catch (error) {
      console.error("Post-login application initialization retry failed", error);
      if (error instanceof ApiRequestError && error.status === 401) {
        resetAuthenticatedApplicationServices();
        setSession(null);
        await hydratePublicApplicationServices();
        navigate("/login", { replace: true, state: authGateState(location) });
      } else {
        setStartupError("部分学习数据加载失败，请重试。");
      }
    } finally {
      setReady(true);
    }
  }

  function protectedElement(element: ReactNode) {
    return session ? element : <Navigate to="/login" replace state={authGateState(location)} />;
  }

  if (oauthWindowResult) {
    return <McpOAuthWindowResult
      result={oauthWindowResult}
      onClose={closeCurrentOAuthWindow}
      onReturn={() => { try { window.location.replace(`${window.location.pathname}${cleanMcpOAuthSearch(window.location.search)}${window.location.hash}`); } catch { /* leave the result visible */ } }}
    />;
  }

  const editor = routeWorkflowId && session
    ? <WorkflowV2Route key={`${session.userId}:${routeWorkflowId}`} ownerId={session.userId} workflowId={routeWorkflowId} navigation={null} focus={workflowFocus} onBack={() => navigate(typeof location.state?.workflowLibraryReturn === "string" && /^\/works(?:\?|$)/.test(location.state.workflowLibraryReturn) ? location.state.workflowLibraryReturn : "/works")} onOpen={(id) => navigate(`/works/${id}`, { state: typeof location.state?.workflowLibraryReturn === "string" ? { workflowLibraryReturn: location.state.workflowLibraryReturn } : undefined })} launchContext={assignmentContext ?? undefined} assistantProposal={applicationServices.preview?.assistantProposal ?? undefined} />
    : <NotFoundPage onHome={() => navigate("/")} onArchive={() => navigate("/archive")} />;

  if (!ready) return <ConnectionScreen />;
  if (startupError) return <ConnectionScreen error={startupError} onRetry={() => void retryStartup()} />;

  return (
    <AuthProvider value={{ session, signIn, signUp, logout, changePassword, requestPasswordReset, updatePassword }}>
      <AppChrome session={session} onLogout={logout} onOpenResources={() => setGlobalResources({ tab: "market", focusRef: "", notice: "" })}>
        <AssistantRuntimeBoundary session={session}>
          <Suspense fallback={<main className="ef-connection" role="status">正在加载页面…</main>}>
            <Routes>
              <RouterRoute path="/login" element={session ? <Navigate to={resolveAuthRedirect(location.state)} replace /> : <AuthPage mode="login" />} />
              <RouterRoute path="/register" element={session ? <Navigate to={resolveAuthRedirect(location.state)} replace /> : <AuthPage mode="register" />} />
              <RouterRoute path="/forgot-password" element={session ? <Navigate to="/" replace /> : <ForgotPasswordPage enabled={passwordResetEnabled} />} />
              <RouterRoute path="/reset-password" element={<ResetPasswordPage enabled={passwordResetEnabled} />} />
              <RouterRoute path="/" element={session ? <LearningPage session={session} onLogout={logout} /> : <PublicHomePage />} />
              <RouterRoute path="/archive" element={<ArchivePage session={session} onRetry={reloadArchiveData} />} />
              <RouterRoute path="/learn/micro/:knowledgeId" element={<MicroLearningExperience session={session} onLogout={logout} repository={applicationServices.microLearningRepository} />} />
              <RouterRoute path="/works" element={protectedElement(session ? <WorkflowLibraryPage userId={session.userId} learnerStateService={applicationServices.learnerStateService} onOpenWorkflow={(id, returnTo, focus) => navigate(`/works/${id}`, { state: { workflowLibraryReturn: returnTo, ...(focus ? { workflowFocus: focus } : {}) } })} versionPreviews={applicationServices.preview?.workflowVersions ?? []} /> : null)} />
              <RouterRoute path="/works/:workflowId" element={protectedElement(editor)} />
              <RouterRoute path="/courses" element={<LegacyRedirect />} />
              <RouterRoute path="/courses/" element={<LegacyRedirect />} />
              <RouterRoute path="/courses/create" element={protectedElement(session ? <CourseCreationWorkspacePage session={session} onLogout={logout} entryMode="learner" /> : null)} />
              <RouterRoute path="/teaching" element={!session ? protectedElement(null) : canManageCourses(session) ? <CourseManagementPage session={session} onLogout={logout} /> : <Navigate to="/" replace />} />
              <RouterRoute path="/teaching/create" element={!session ? protectedElement(null) : canManageCourses(session) ? <CourseCreationWorkspacePage session={session} onLogout={logout} entryMode="teacher" /> : <Navigate to="/" replace />} />
              <RouterRoute path="/course-management" element={<LegacyRedirect />} />
              <RouterRoute path="/courses/:courseId" element={<CourseGraphPage session={session} onLogout={logout} microLearningProvider={applicationServices.microLearningRepository} />} />
              <RouterRoute path="/courses/:courseId/assignments/:assignmentId" element={<AssignmentExperiencePage session={session} onLogout={logout} />} />
              <RouterRoute path="/courses/:courseId/materials/:materialId" element={<LessonPage session={session} onLogout={logout} />} />
              <RouterRoute path="/courses/:courseId/chapters/:chapterId" element={<CourseGraphPage session={session} onLogout={logout} microLearningProvider={applicationServices.microLearningRepository} />} />
              <RouterRoute path="/records" element={protectedElement(<RecordsPage />)} />
              <RouterRoute path="/settings" element={protectedElement(session ? <SettingsPage session={session} preview={applicationServices.preview?.settings ?? EMPTY_SETTINGS_PREVIEW} onDisplayNameChange={(name) => setSession((previous) => previous ? { ...previous, name } : previous)} /> : null)} />
              <RouterRoute path="/settings/*" element={protectedElement(<Navigate to="/settings" replace />)} />
              <RouterRoute path="/admin" element={!session ? protectedElement(null) : canManageKnowledgeDomains(session) ? <AdminPage session={session} previewUsers={applicationServices.preview?.adminUsers ?? []} /> : <Navigate to="/" replace />} />
              <RouterRoute path="/admin/domains" element={<LegacyRedirect />} />
              <RouterRoute path="/system/*" element={<LegacyRedirect />} />
              <RouterRoute path="/tasks/*" element={protectedElement(<Navigate to="/" replace />)} />
              <RouterRoute path="/profile" element={protectedElement(<LegacyRedirect />)} />
              <RouterRoute path="/profile/*" element={protectedElement(<LegacyRedirect />)} />
              <RouterRoute path="/notifications/*" element={protectedElement(<Navigate to="/" replace />)} />
              <RouterRoute path="/messages/*" element={<Navigate to="/" replace />} />
              <RouterRoute path="/explore" element={<LegacyRedirect />} />
              <RouterRoute path="/workflows/*" element={<LegacyRedirect />} />
              <RouterRoute path="*" element={<NotFoundPage onHome={() => navigate("/")} onArchive={() => navigate("/archive")} />} />
            </Routes>
          </Suspense>
        </AssistantRuntimeBoundary>
      </AppChrome>
      <GlobalResourceCenter view={globalResources} onClose={() => setGlobalResources(null)} onOpenReference={(workflowId) => navigate(`/works/${workflowId}`)} />
      <GlobalCommandPalette session={session} />
    </AuthProvider>
  );
}
