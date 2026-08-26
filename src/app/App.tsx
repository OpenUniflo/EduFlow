import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Route as RouterRoute, Routes, useLocation, useMatch, useNavigate } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthContext";
import type { MockSession } from "@/features/auth/types";
import { canManageCourses, canManageKnowledgeDomains } from "@/features/auth/capabilities";
import { AuthPage } from "@/features/auth/pages/AuthPage";
import { NavigationProvider } from "@/app/providers/NavigationContext";
import { GlobalNav } from "@/app/components/GlobalNav";
import { NotFoundPage } from "@/app/pages/PlaceholderPages";
import { applicationServices, hydrateApplicationServices } from "@/app/services/applicationServices";
import { attachWorkflowAssignmentMetadata, resolveWorkflowAssignmentContext, completeWorkflowAssignmentRun } from "@/app/integrations/workflowAssignmentIntegration";
import { ExplorePage } from "@/features/explore/pages/ExplorePage";
import { LearningPage } from "@/features/learning/pages/LearningPage";
import { MicroLearningExperience } from "@/features/learning/micro/MicroLearningExperience";
import { CourseCenterPage } from "@/features/course/pages/CoursePages";
import { CourseManagementPage } from "@/features/course/pages/CourseManagementPage";
import { CourseCreationWorkspacePage } from "@/features/course/pages/CourseCreationWorkspacePage";
import { CourseGraphPage } from "@/features/course/pages/CourseGraphPage";
import { ManualCourseCreationPage } from "@/features/course/pages/ManualCourseCreationPage";
import { AssignmentExperiencePage } from "@/features/course/pages/AssignmentExperiencePage";
import { LessonPage } from "@/features/material/pages/LessonPage";
import { DomainManagementPage } from "@/features/admin/domains/DomainManagementPage";
import { WorkflowLibraryPage } from "@/features/workflow/pages/WorkflowLibraryPage";
import { WorkflowEditorPage } from "@/features/workflow/pages/WorkflowEditorPage";
import { useWorkflowController } from "@/features/workflow/application/useWorkflowController";
import { ApiWorkflowPersistence } from "@/features/workflow/repository/ApiWorkflowPersistence";
import { demoWorkflowTemplates } from "@/demo/workflows/demoWorkflowTemplates";
import { demoWorkflowSettings } from "@/demo/workflows/demoWorkflowSettings";
import { DemoWorkflowRuntime } from "@/demo/workflows/DemoWorkflowRuntime";
import { inferDemoWorkflowTemplateId } from "@/demo/workflows/descriptionWorkflowGenerator";
import { DemoWorkflowCodeExporter } from "@/demo/workflows/demoWorkflowCode";
import { supabaseClient } from "@/shared/api/supabaseClient";
import { demoCourseCreationScenarioResolver } from "@/demo/scenarios/agenticAiBook/scenario";
import { demoLessonAssistantProvider } from "@/demo/scenarios/agenticAiBook/lessonAssistantScripts";
import { demoWorkflowAssessmentProvider } from "@/demo/scenarios/agenticAiBook/workflowAssessment";
import { demoCourseDesignAssistantProvider } from "@/demo/scenarios/agenticAiBook/courseDesignAssistantScripts";
import { resolveLegacyRoute } from "@/app/legacyRoutes";
import { AssistantRuntimeProvider } from "@/features/assistant/AssistantRuntimeContext";
import { AssistantMessagesPage } from "@/features/assistant/pages/AssistantMessagesPage";

function AssistantRuntimeBoundary({ session, children }: { session: MockSession | null; children: ReactNode }) {
  return session ? <AssistantRuntimeProvider session={session}>{children}</AssistantRuntimeProvider> : children;
}

function LegacyRedirect() {
  const location = useLocation();
  return <Navigate to={resolveLegacyRoute(location.pathname,location.search)} replace />;
}

function getAuthRedirect(state: unknown) {
  if (!state || typeof state !== "object" || !("from" in state)) return "/";
  const from = (state as { from?: unknown }).from;
  if (!from || typeof from !== "object" || !("pathname" in from)) return "/";
  const pathname = String((from as { pathname: unknown }).pathname);
  const search = "search" in from ? String((from as { search?: unknown }).search ?? "") : "";
  return `${pathname}${search}`;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeWorkflowId = useMatch("/workflows/:workflowId")?.params.workflowId;
  const [session, setSession] = useState<MockSession | null>(null);
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [workflowVersion, setWorkflowVersion] = useState(0);
  const [workflowPersistence] = useState(() => new ApiWorkflowPersistence(demoWorkflowSettings));
  const [workflowRuntime] = useState(() => new DemoWorkflowRuntime());
  const [workflowCodeExporter] = useState(() => new DemoWorkflowCodeExporter());
  const workflowDependencies = useMemo(() => ({
    builtinWorkflows: demoWorkflowTemplates,
    persistence: workflowPersistence,
    runtime: workflowRuntime,
    codeExporter: workflowCodeExporter,
    inferTemplateId: inferDemoWorkflowTemplateId,
    hydrationKey: workflowVersion
  }), [workflowCodeExporter, workflowPersistence, workflowRuntime, workflowVersion]);

  useEffect(() => {
    let active = true;
    async function restore() {
      const { data } = await supabaseClient.auth.getSession();
      const authSession = data.session;
      if (!active) return;
      if (!authSession) { setReady(true); return; }
      try {
        const [profile] = await Promise.all([hydrateApplicationServices(authSession.user.id), workflowPersistence.hydrate()]);
        if (!active) return;
        const name = profile.displayName || authSession.user.email?.split("@")[0] || "学习者";
        setSession({ userId: authSession.user.id, name, email: authSession.user.email ?? "", role: profile.role, capabilities: profile.capabilities, createdAt: authSession.user.created_at });
        setWorkflowVersion((version) => version + 1);
      } catch (error) {
        console.error("Post-login application initialization failed", error);
        setStartupError("部分学习数据加载失败，请重试。");
      } finally {
        setReady(true);
      }
    }
    void restore();
    const { data } = supabaseClient.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && active) setSession(null);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [workflowPersistence]);
  const assignmentContext = useMemo(
    () => routeWorkflowId ? resolveWorkflowAssignmentContext(applicationServices.courseRepository, routeWorkflowId, location.search) : null,
    [location.search, routeWorkflowId]
  );
  const finalizeRunRecord = useCallback(
    (record: Parameters<typeof attachWorkflowAssignmentMetadata>[0]) => attachWorkflowAssignmentMetadata(record, assignmentContext),
    [assignmentContext]
  );
  const onRunCompleted = useCallback((record: Parameters<typeof completeWorkflowAssignmentRun>[2]) => {
    if (session) completeWorkflowAssignmentRun(applicationServices.learningProgressRepository, session.userId, record);
  }, [session]);
  const workflow = useWorkflowController(workflowDependencies, {
    routeWorkflowId,
    finalizeRunRecord,
    onRunCompleted
  });

  function openWorkflow(templateId: string) {
    workflow.switchTemplate(templateId);
    navigate(`/workflows/${templateId}`);
  }

  function createWorkflow() {
    navigate(`/workflows/${workflow.createWorkflow()}`);
  }

  function deleteWorkflow(templateId: string) {
    workflow.deleteWorkflow(templateId);
  }

  async function logout() {
    workflow.stopRun();
    await Promise.all([
      workflowPersistence.flush(),
      (applicationServices.learningProgressRepository as { flush?: () => Promise<unknown> }).flush?.()
    ]);
    await supabaseClient.auth.signOut();
    setSession(null);
    navigate("/login", { replace: true });
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
      [profile] = await Promise.all([hydrateApplicationServices(data.user.id), workflowPersistence.hydrate()]);
    } catch (initializationError) {
      console.error("Post-login application initialization failed", initializationError);
      setStartupError("部分学习数据加载失败，请重试。");
      return;
    }
    const name = profile.displayName || data.user.email?.split("@")[0] || "学习者";
    setSession({ userId: data.user.id, name, email: data.user.email ?? "", role: profile.role, capabilities: profile.capabilities, createdAt: data.user.created_at });
    setWorkflowVersion((version) => version + 1);
    navigate(getAuthRedirect(location.state), { replace: true });
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
      if (!data.session) { setSession(null); return; }
      const [profile] = await Promise.all([hydrateApplicationServices(data.session.user.id), workflowPersistence.hydrate()]);
      const name = profile.displayName || data.session.user.email?.split("@")[0] || "学习者";
      setSession({ userId: data.session.user.id, name, email: data.session.user.email ?? "", role: profile.role, capabilities: profile.capabilities, createdAt: data.session.user.created_at });
      setWorkflowVersion((version) => version + 1);
    } catch (error) {
      console.error("Post-login application initialization retry failed", error);
      setStartupError("部分学习数据加载失败，请重试。");
    } finally {
      setReady(true);
    }
  }

  function protectedElement(element: ReactNode) {
    return session ? element : <Navigate to="/login" replace state={{ from: location }} />;
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
  const workflowAssessment = useMemo(() => demoWorkflowAssessmentProvider.resolve(assignmentContext), [assignmentContext]);
  const editor = workflow.routeTemplate && session ? (
    <WorkflowEditorPage
      key={workflow.routeTemplate.id}
      controller={workflow}
      navigation={<div className="atlas-canvas-nav"><GlobalNav active="canvas" session={session} onLogout={logout} /></div>}
      onBack={() => navigate("/workflows")}
      onWorkflowGenerated={(templateId) => navigate(`/workflows/${templateId}`)}
      assessment={workflowAssessment}
    />
  ) : <NotFoundPage onHome={() => navigate("/")} />;

  if (!ready) return <main className="atlas-auth-page"><section className="atlas-auth-panel glass-v2"><h2>正在连接 EduFlow…</h2></section></main>;
  if (startupError) return <main className="atlas-auth-page"><section className="atlas-auth-panel glass-v2"><h2>数据连接失败</h2><p>{startupError}</p><button className="atlas-primary" onClick={() => void retryStartup()}>重新加载</button></section></main>;

  return (
    <AuthProvider value={{ session, signIn, signUp, logout }}>
      <NavigationProvider value={navigationContextValue}>
        <AssistantRuntimeBoundary session={session}>
        <Routes>
          <RouterRoute path="/login" element={session ? <Navigate to={getAuthRedirect(location.state)} replace /> : <AuthPage mode="login" />} />
          <RouterRoute path="/register" element={session ? <Navigate to={getAuthRedirect(location.state)} replace /> : <AuthPage mode="register" />} />
          <RouterRoute path="/" element={protectedElement(session ? <LearningPage session={session} onLogout={logout} /> : null)} />
          <RouterRoute path="/explore" element={protectedElement(session ? <ExplorePage session={session} onLogout={logout} /> : null)} />
          <RouterRoute path="/learn/micro/:knowledgeId" element={protectedElement(session ? <MicroLearningExperience session={session} onLogout={logout} repository={applicationServices.microLearningRepository} /> : null)} />
          <RouterRoute path="/workflows" element={protectedElement(session ? <WorkflowLibraryPage navigation={<GlobalNav active="canvas" session={session} onLogout={logout} />} userId={session.userId} courseRepository={applicationServices.courseRepository} learningProgressRepository={applicationServices.learningProgressRepository} workflows={workflow.workflows} activeTemplateId={workflow.activeTemplateId} onOpenWorkflow={openWorkflow} onCreateWorkflow={createWorkflow} onDeleteWorkflow={deleteWorkflow} /> : null)} />
          <RouterRoute path="/workflows/:workflowId" element={protectedElement(editor)} />
          <RouterRoute path="/courses" element={protectedElement(session ? <CourseCenterPage session={session} onLogout={logout} /> : null)} />
          <RouterRoute path="/courses/create" element={protectedElement(session ? <CourseCreationWorkspacePage session={session} onLogout={logout} resolver={demoCourseCreationScenarioResolver} /> : null)} />
          <RouterRoute path="/teaching" element={canManageCourses(session) ? protectedElement(session ? <CourseManagementPage session={session} onLogout={logout} /> : null) : <Navigate to="/courses" replace />} />
          <RouterRoute path="/teaching/create" element={canManageCourses(session) ? protectedElement(session ? <ManualCourseCreationPage session={session} onLogout={logout} /> : null) : <Navigate to="/courses" replace />} />
          <RouterRoute path="/course-management" element={<LegacyRedirect />} />
          <RouterRoute path="/courses/:courseId" element={protectedElement(session ? <CourseGraphPage session={session} onLogout={logout} courseDesignAssistantProvider={demoCourseDesignAssistantProvider} microLearningProvider={applicationServices.microLearningRepository} /> : null)} />
          <RouterRoute path="/courses/:courseId/assignments/:assignmentId" element={protectedElement(session ? <AssignmentExperiencePage session={session} onLogout={logout} /> : null)} />
          <RouterRoute path="/courses/:courseId/materials/:materialId" element={protectedElement(session ? <LessonPage session={session} onLogout={logout} lessonAssistantProvider={demoLessonAssistantProvider} /> : null)} />
          <RouterRoute path="/courses/:courseId/chapters/:chapterId" element={protectedElement(session ? <CourseGraphPage session={session} onLogout={logout} courseDesignAssistantProvider={demoCourseDesignAssistantProvider} microLearningProvider={applicationServices.microLearningRepository} /> : null)} />
          <RouterRoute path="/tasks/*" element={<Navigate to="/" replace />} />
          <RouterRoute path="/system" element={canManageKnowledgeDomains(session) ? protectedElement(session ? <DomainManagementPage session={session} onLogout={logout} /> : null) : <Navigate to="/" replace />} />
          <RouterRoute path="/system/domains" element={<Navigate to="/system" replace />} />
          <RouterRoute path="/admin/domains" element={<LegacyRedirect />} />
          <RouterRoute path="/profile" element={<LegacyRedirect />} />
          <RouterRoute path="/profile/*" element={<LegacyRedirect />} />
          <RouterRoute path="/settings/*" element={<Navigate to="/" replace />} />
          <RouterRoute path="/notifications/*" element={<Navigate to="/" replace />} />
          <RouterRoute path="/messages/*" element={protectedElement(session ? <AssistantMessagesPage session={session} onLogout={logout} /> : null)} />
          <RouterRoute path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </AssistantRuntimeBoundary>
      </NavigationProvider>
    </AuthProvider>
  );
}
