import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Route as RouterRoute, Routes, useLocation, useMatch, useNavigate } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthContext";
import type { MockSession } from "@/features/auth/types";
import { canManageCourses, canManageKnowledgeDomains } from "@/features/auth/capabilities";
import { AuthPage } from "@/features/auth/pages/AuthPage";
import { NavigationProvider } from "@/app/providers/NavigationContext";
import { GlobalNav } from "@/app/components/GlobalNav";
import { NotFoundPage } from "@/app/pages/PlaceholderPages";
import { PublicHomePage } from "@/app/pages/PublicHomePage";
import { applicationServices, hydrateApplicationServices, hydratePublicApplicationServices, resetAuthenticatedApplicationServices } from "@/app/services/applicationServices";
import { resolveWorkflowAssignmentContext } from "@/app/integrations/workflowAssignmentIntegration";
import { ExplorePage } from "@/features/explore/pages/ExplorePage";
import { LearningPage } from "@/features/learning/pages/LearningPage";
import { MicroLearningExperience } from "@/features/learning/micro/MicroLearningExperience";
import { CourseCenterPage } from "@/features/course/pages/CoursePages";
import { CourseManagementPage } from "@/features/course/pages/CourseManagementPage";
import { CourseCreationWorkspacePage } from "@/features/course/pages/CourseCreationWorkspacePage";
import { CourseGraphPage } from "@/features/course/pages/CourseGraphPage";
import { AssignmentExperiencePage } from "@/features/course/pages/AssignmentExperiencePage";
import { LessonPage } from "@/features/material/pages/LessonPage";
import { DomainManagementPage } from "@/features/admin/domains/DomainManagementPage";
import { WorkflowLibraryPage } from "@/features/workflow/pages/WorkflowLibraryPage";
import { retireLegacyWorkflowStorage } from "@/features/workflow/editor/v2/retireLegacyStorage";
import { WorkflowV2Route } from "@/features/workflow/pages/WorkflowV2Entry";
import { supabaseClient } from "@/shared/api/supabaseClient";
import { demoCourseCreationScenarioResolver } from "@/demo/scenarios/agenticAiBook/scenario";
import { demoLessonAssistantProvider } from "@/demo/scenarios/agenticAiBook/lessonAssistantScripts";
import { demoCourseDesignAssistantProvider } from "@/demo/scenarios/agenticAiBook/courseDesignAssistantScripts";
import { resolveLegacyRoute } from "@/app/legacyRoutes";
import { ApiRequestError } from "@/shared/api/apiClient";
import { CapabilityEvidenceBoundary } from "@/app/integrations/CapabilityEvidenceBoundary";
import { AssistantRuntimeProvider } from "@/features/assistant/AssistantRuntimeContext";
import { AssistantMessagesPage } from "@/features/assistant/pages/AssistantMessagesPage";
import { authGateState, resolveAuthRedirect } from "@/features/auth/authRedirect";

function AssistantRuntimeBoundary({ session, children }: { session: MockSession | null; children: ReactNode }) {
  return session ? <AssistantRuntimeProvider session={session}><CapabilityEvidenceBoundary session={session}>{children}</CapabilityEvidenceBoundary></AssistantRuntimeProvider> : children;
}

function LegacyRedirect() {
  const location = useLocation();
  return <Navigate to={resolveLegacyRoute(location.pathname,location.search)} replace />;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeWorkflowId = useMatch("/workflows/:workflowId")?.params.workflowId;
  const [session, setSession] = useState<MockSession | null>(null);
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState("");

  useEffect(() => {
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
        setSession({ userId: authSession.user.id, name, email: authSession.user.email ?? "", role: profile.role, capabilities: profile.capabilities, createdAt: authSession.user.created_at });
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
    () => routeWorkflowId ? resolveWorkflowAssignmentContext(applicationServices.courseRepository, routeWorkflowId, location.search) : null,
    [location.search, routeWorkflowId, ready]
  );
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
      throw new Error(invalidCredentials ? "邮箱或密码错误" : "登录失败，请稍后重试。");
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
    setSession({ userId: data.user.id, name, email: data.user.email ?? "", role: profile.role, capabilities: profile.capabilities, createdAt: data.user.created_at });
    navigate(resolveAuthRedirect(location.state), { replace: true });
  }

  async function signUp(input: { name: string; email: string; password: string }) {
    const { data, error } = await supabaseClient.auth.signUp({ email: input.email, password: input.password, options: { data: { display_name: input.name } } });
    if (error) throw new Error(error.message);
    if (!data.session) return { confirmationRequired: true };
    await signIn({ email: input.email, password: input.password });
    return { confirmationRequired: false };
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
      setSession({ userId: data.session.user.id, name, email: data.session.user.email ?? "", role: profile.role, capabilities: profile.capabilities, createdAt: data.session.user.created_at });
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

  const navigationContextValue = {
    onGoCourses: () => navigate("/courses"),
    onGoTasks: () => navigate("/"),
    onGoWorkflows: () => navigate("/workflows"),
    onGoProfile: () => navigate("/profile"),
    onGoSettings: () => navigate("/settings"),
    onGoNotifications: () => navigate("/notifications"),
    onGoMessages: () => navigate("/messages"),
    onLogout: logout
  };
  const editor = routeWorkflowId && session ? <WorkflowV2Route key={`${session.userId}:${routeWorkflowId}`} ownerId={session.userId} workflowId={routeWorkflowId} navigation={<div className="atlas-canvas-nav"><GlobalNav active="canvas" session={session} onLogout={logout} /></div>} onBack={() => navigate(typeof location.state?.workflowLibraryReturn === "string" && /^\/workflows(?:\?|$)/.test(location.state.workflowLibraryReturn) ? location.state.workflowLibraryReturn : "/workflows")} onOpen={(id) => navigate(`/workflows/${id}`, {state:location.state})} launchContext={assignmentContext ?? undefined} /> : <NotFoundPage onHome={() => navigate("/")} />;

  if (!ready) return <main className="atlas-auth-page"><section className="atlas-auth-panel glass-v2"><h2>正在连接 EduFlow…</h2></section></main>;
  if (startupError) return <main className="atlas-auth-page"><section className="atlas-auth-panel glass-v2"><h2>数据连接失败</h2><p>{startupError}</p><button className="atlas-primary" onClick={() => void retryStartup()}>重新加载</button></section></main>;

  return (
    <AuthProvider value={{ session, signIn, signUp, logout }}>
      <NavigationProvider value={navigationContextValue}>
        <AssistantRuntimeBoundary session={session}>
        <Routes>
          <RouterRoute path="/login" element={session ? <Navigate to={resolveAuthRedirect(location.state)} replace /> : <AuthPage mode="login" />} />
          <RouterRoute path="/register" element={session ? <Navigate to={resolveAuthRedirect(location.state)} replace /> : <AuthPage mode="register" />} />
          <RouterRoute path="/" element={session ? <LearningPage session={session} onLogout={logout} /> : <PublicHomePage />} />
          <RouterRoute path="/explore" element={<ExplorePage session={session} onLogout={logout} />} />
          <RouterRoute path="/learn/micro/:knowledgeId" element={<MicroLearningExperience session={session} onLogout={logout} repository={applicationServices.microLearningRepository} />} />
          <RouterRoute path="/workflows" element={protectedElement(session ? <WorkflowLibraryPage navigation={<GlobalNav active="canvas" session={session} onLogout={logout} />} userId={session.userId} courseRepository={applicationServices.courseRepository} learningProgressRepository={applicationServices.learningProgressRepository} onOpenWorkflow={(id, returnTo) => navigate(`/workflows/${id}`, {state:{workflowLibraryReturn:returnTo}})} /> : null)} />
          <RouterRoute path="/workflows/:workflowId" element={protectedElement(editor)} />
          <RouterRoute path="/courses" element={<CourseCenterPage session={session} onLogout={logout} />} />
          <RouterRoute path="/courses/create" element={protectedElement(session ? <CourseCreationWorkspacePage session={session} onLogout={logout} resolver={demoCourseCreationScenarioResolver} entryMode="learner" /> : null)} />
          <RouterRoute path="/teaching" element={!session ? protectedElement(null) : canManageCourses(session) ? <CourseManagementPage session={session} onLogout={logout} /> : <Navigate to="/courses" replace />} />
          <RouterRoute path="/teaching/create" element={!session ? protectedElement(null) : canManageCourses(session) ? <CourseCreationWorkspacePage session={session} onLogout={logout} resolver={demoCourseCreationScenarioResolver} entryMode="teacher" /> : <Navigate to="/courses" replace />} />
          <RouterRoute path="/course-management" element={<LegacyRedirect />} />
          <RouterRoute path="/courses/:courseId" element={<CourseGraphPage session={session} onLogout={logout} courseDesignAssistantProvider={demoCourseDesignAssistantProvider} microLearningProvider={applicationServices.microLearningRepository} />} />
          <RouterRoute path="/courses/:courseId/assignments/:assignmentId" element={<AssignmentExperiencePage session={session} onLogout={logout} />} />
          <RouterRoute path="/courses/:courseId/materials/:materialId" element={<LessonPage session={session} onLogout={logout} lessonAssistantProvider={demoLessonAssistantProvider} />} />
          <RouterRoute path="/courses/:courseId/chapters/:chapterId" element={<CourseGraphPage session={session} onLogout={logout} courseDesignAssistantProvider={demoCourseDesignAssistantProvider} microLearningProvider={applicationServices.microLearningRepository} />} />
          <RouterRoute path="/tasks/*" element={protectedElement(<Navigate to="/" replace />)} />
          <RouterRoute path="/system" element={!session ? protectedElement(null) : canManageKnowledgeDomains(session) ? <DomainManagementPage session={session} onLogout={logout} /> : <Navigate to="/" replace />} />
          <RouterRoute path="/system/domains" element={<Navigate to="/system" replace />} />
          <RouterRoute path="/admin/domains" element={<LegacyRedirect />} />
          <RouterRoute path="/profile" element={protectedElement(<LegacyRedirect />)} />
          <RouterRoute path="/profile/*" element={protectedElement(<LegacyRedirect />)} />
          <RouterRoute path="/settings/*" element={protectedElement(<Navigate to="/" replace />)} />
          <RouterRoute path="/notifications/*" element={protectedElement(<Navigate to="/" replace />)} />
          <RouterRoute path="/messages/*" element={protectedElement(session ? <AssistantMessagesPage session={session} onLogout={logout} /> : null)} />
          <RouterRoute path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </AssistantRuntimeBoundary>
      </NavigationProvider>
    </AuthProvider>
  );
}
