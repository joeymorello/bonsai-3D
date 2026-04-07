import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Dashboard } from "./pages/dashboard";
import { CreateWorkspace } from "./pages/create-workspace";
import { WorkspaceView } from "./pages/workspace-view";
import { AuthPage } from "./pages/auth";
import { getAuthToken } from "./lib/api";

const Editor = lazy(() =>
  import("./pages/editor").then((m) => ({ default: m.Editor })),
);

function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const token = getAuthToken();

  if (!token) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function EditorFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-900 text-gray-400">
      Loading editor...
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/workspace/new"
        element={
          <RequireAuth>
            <CreateWorkspace />
          </RequireAuth>
        }
      />
      <Route
        path="/workspace/:id"
        element={
          <RequireAuth>
            <WorkspaceView />
          </RequireAuth>
        }
      />
      <Route
        path="/workspace/:id/editor"
        element={
          <RequireAuth>
            <Suspense fallback={<EditorFallback />}>
              <Editor />
            </Suspense>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
