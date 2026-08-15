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
import { AtlasHome } from "@/features/knowledge/pages/AtlasHome";
import { CourseCenterPage } from "@/features/course/pages/CoursePages";
import { CourseManagementPage } from "@/features/course/pages/CourseManagementPage";
import { CourseCreationWorkspacePage } from "@/features/course/pages/CourseCreationWorkspacePage";
import { CourseGraphPage } from "@/features/course/pages/CourseGraphPage";
import { LessonPage } from "@/features/material/pages/LessonPage";
import { ProfileKnowledgePage } from "@/features/profile/pages/ProfileKnowledgePage";
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
        setStartupError("账号已登录，但应用数据加载失败，请稍后重试。");
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
      throw new Error("账号已登录，但应用数据加载失败，请稍后重试。");
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
  const allCourseAssignments = useMemo(() => applicationServices.courseRepository.listCourseRuntimes().flatMap((runtime) => runtime.assignments), []);
  const editor = workflow.routeTemplate && session ? (
    <WorkflowEditorPage
      key={workflow.routeTemplate.id}
      controller={workflow}
      navigation={<div className="atlas-canvas-nav"><GlobalNav active="workflows" session={session} onLogout={logout} /></div>}
      onBack={() => navigate("/workflows")}
      onWorkflowGenerated={(templateId) => navigate(`/workflows/${templateId}`)}
      showAcceptance={allCourseAssignments.some((item) => item.workflowTemplateId === workflow.activeTemplate.id)}
    />
  ) : <NotFoundPage onHome={() => navigate("/")} />;

  if (!ready) return <main className="atlas-auth-page"><section className="atlas-auth-panel glass-v2"><h2>正在连接 EduFlow…</h2></section></main>;
  if (startupError) return <main className="atlas-auth-page"><section className="atlas-auth-panel glass-v2"><h2>数据连接失败</h2><p>{startupError}</p></section></main>;

  return (
    <AuthProvider value={{ session, signIn, signUp, logout }}>
      <NavigationProvider value={navigationContextValue}>
        <Routes>
          <RouterRoute path="/login" element={session ? <Navigate to={getAuthRedirect(location.state)} replace /> : <AuthPage mode="login" />} />
          <RouterRoute path="/register" element={session ? <Navigate to={getAuthRedirect(location.state)} replace /> : <AuthPage mode="register" />} />
          <RouterRoute path="/" element={protectedElement(session ? <AtlasHome session={session} onLogout={logout} /> : null)} />
          <RouterRoute path="/workflows" element={protectedElement(session ? <WorkflowLibraryPage navigation={<GlobalNav active="workflows" session={session} onLogout={logout} />} userId={session.userId} courseRepository={applicationServices.courseRepository} learningProgressRepository={applicationServices.learningProgressRepository} workflows={workflow.workflows} activeTemplateId={workflow.activeTemplateId} onOpenWorkflow={openWorkflow} onCreateWorkflow={createWorkflow} onDeleteWorkflow={deleteWorkflow} /> : null)} />
          <RouterRoute path="/workflows/:workflowId" element={protectedElement(editor)} />
          <RouterRoute path="/courses" element={protectedElement(session ? <CourseCenterPage session={session} onLogout={logout} /> : null)} />
          <RouterRoute path="/courses/create" element={canManageCourses(session) ? protectedElement(session ? <CourseCreationWorkspacePage session={session} onLogout={logout} resolver={demoCourseCreationScenarioResolver} /> : null) : <Navigate to="/courses" replace />} />
          <RouterRoute path="/course-management" element={canManageCourses(session) ? protectedElement(session ? <CourseManagementPage session={session} onLogout={logout} /> : null) : <Navigate to="/courses" replace />} />
          <RouterRoute path="/courses/:courseId" element={protectedElement(session ? <CourseGraphPage session={session} onLogout={logout} /> : null)} />
          <RouterRoute path="/courses/:courseId/materials/:materialId" element={protectedElement(session ? <LessonPage session={session} onLogout={logout} /> : null)} />
          <RouterRoute path="/courses/:courseId/chapters/:chapterId" element={protectedElement(session ? <CourseGraphPage session={session} onLogout={logout} /> : null)} />
          <RouterRoute path="/tasks/*" element={<Navigate to="/" replace />} />
          <RouterRoute path="/profile" element={protectedElement(session ? <ProfileKnowledgePage session={session} onLogout={logout} /> : null)} />
          <RouterRoute path="/admin/domains" element={canManageKnowledgeDomains(session) ? protectedElement(session ? <DomainManagementPage session={session} onLogout={logout} /> : null) : <Navigate to="/" replace />} />
          <RouterRoute path="/profile/*" element={<Navigate to="/profile" replace />} />
          <RouterRoute path="/settings/*" element={<Navigate to="/" replace />} />
          <RouterRoute path="/notifications/*" element={<Navigate to="/" replace />} />
          <RouterRoute path="/messages/*" element={<Navigate to="/" replace />} />
          <RouterRoute path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </NavigationProvider>
    </AuthProvider>
  );
}
