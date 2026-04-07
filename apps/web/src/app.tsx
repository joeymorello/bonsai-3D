import { Routes, Route, Navigate } from "react-router-dom";
import { Dashboard } from "./pages/dashboard";
import { CreateWorkspace } from "./pages/create-workspace";
import { WorkspaceView } from "./pages/workspace-view";
import { Editor } from "./pages/editor";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/workspace/new" element={<CreateWorkspace />} />
      <Route path="/workspace/:id" element={<WorkspaceView />} />
      <Route path="/workspace/:id/editor" element={<Editor />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
