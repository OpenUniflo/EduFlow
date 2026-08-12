import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Navigate, Route as RouterRoute, Routes, useLocation, useMatch, useNavigate } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthContext";
import type { MockSession } from "@/features/auth/types";
import { clearMockSession, readMockSession, writeMockSession } from "@/features/auth/session";
import { canManageKnowledgeDomains } from "@/features/auth/capabilities";
import { AuthPage } from "@/features/auth/pages/AuthPage";
import { NavigationProvider } from "@/app/providers/NavigationContext";
import { GlobalNav } from "@/app/components/GlobalNav";
import { NotFoundPage } from "@/app/pages/PlaceholderPages";
import { applicationServices } from "@/app/services/applicationServices";
import { attachWorkflowAssignmentMetadata, resolveWorkflowAssignmentContext, completeWorkflowAssignmentRun } from "@/app/integrations/workflowAssignmentIntegration";
import { AtlasHome } from "@/features/knowledge/pages/AtlasHome";
import { CourseCenterPage } from "@/features/course/pages/CoursePages";
import { CourseGraphPage } from "@/features/course/pages/CourseGraphPage";
import { LessonPage } from "@/features/material/pages/LessonPage";
import { ProfileKnowledgePage } from "@/features/profile/pages/ProfileKnowledgePage";
import { DomainManagementPage } from "@/features/admin/domains/DomainManagementPage";
import { WorkflowLibraryPage } from "@/features/workflow/pages/WorkflowLibraryPage";
import { WorkflowEditorPage } from "@/features/workflow/pages/WorkflowEditorPage";
import { useWorkflowController } from "@/features/workflow/application/useWorkflowController";
import { LocalStorageWorkflowPersistence } from "@/features/workflow/repository/LocalStorageWorkflowPersistence";
import { demoWorkflowTemplates } from "@/demo/workflows/demoWorkflowTemplates";
import { demoWorkflowSettings } from "@/demo/workflows/demoWorkflowSettings";
import { DemoWorkflowRuntime } from "@/demo/workflows/DemoWorkflowRuntime";
import { inferDemoWorkflowTemplateId } from "@/demo/workflows/descriptionWorkflowGenerator";
import { DemoWorkflowCodeExporter } from "@/demo/workflows/demoWorkflowCode";

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
  const [session, setSession] = useState<MockSession | null>(() => readMockSession());
  const [workflowPersistence] = useState(() => new LocalStorageWorkflowPersistence(window.localStorage, demoWorkflowTemplates, demoWorkflowSettings));
  const [workflowRuntime] = useState(() => new DemoWorkflowRuntime());
  const [workflowCodeExporter] = useState(() => new DemoWorkflowCodeExporter());
  const workflowDependencies = useMemo(() => ({
    builtinWorkflows: demoWorkflowTemplates,
    persistence: workflowPersistence,
    runtime: workflowRuntime,
    codeExporter: workflowCodeExporter,
    inferTemplateId: inferDemoWorkflowTemplateId
  }), [workflowCodeExporter, workflowPersistence, workflowRuntime]);
  const assignmentContext = useMemo(
    () => routeWorkflowId ? resolveWorkflowAssignmentContext(applicationServices.courseRepository, routeWorkflowId, location.search) : null,
    [location.search, routeWorkflowId]
  );
  const finalizeRunRecord = useCallback(
    (record: Parameters<typeof attachWorkflowAssignmentMetadata>[0]) => attachWorkflowAssignmentMetadata(record, assignmentContext),
    [assignmentContext]
  );
  const onRunCompleted = useCallback((record: Parameters<typeof completeWorkflowAssignmentRun>[2]) => {
    if (session) completeWorkflowAssignmentRun(applicationServices.learningProgressRepository, session.email, record);
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

  function logout() {
    workflow.stopRun();
    clearMockSession();
    setSession(null);
    navigate("/login", { replace: true });
  }

  function completeAuth(nextSession: MockSession) {
    writeMockSession(nextSession);
    setSession(nextSession);
    navigate(getAuthRedirect(location.state), { replace: true });
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

  return (
    <AuthProvider value={{ session, completeAuth, logout }}>
      <NavigationProvider value={navigationContextValue}>
        <Routes>
          <RouterRoute path="/login" element={session ? <Navigate to={getAuthRedirect(location.state)} replace /> : <AuthPage mode="login" />} />
          <RouterRoute path="/register" element={session ? <Navigate to={getAuthRedirect(location.state)} replace /> : <AuthPage mode="register" />} />
          <RouterRoute path="/" element={protectedElement(session ? <AtlasHome session={session} onLogout={logout} /> : null)} />
          <RouterRoute path="/workflows" element={protectedElement(session ? <WorkflowLibraryPage navigation={<GlobalNav active="workflows" session={session} onLogout={logout} />} userId={session.email} courseRepository={applicationServices.courseRepository} learningProgressRepository={applicationServices.learningProgressRepository} workflows={workflow.workflows} activeTemplateId={workflow.activeTemplateId} onOpenWorkflow={openWorkflow} onCreateWorkflow={createWorkflow} onDeleteWorkflow={deleteWorkflow} /> : null)} />
          <RouterRoute path="/workflows/:workflowId" element={protectedElement(editor)} />
          <RouterRoute path="/courses" element={protectedElement(session ? <CourseCenterPage session={session} onLogout={logout} /> : null)} />
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
