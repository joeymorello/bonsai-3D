import { useEditorStore } from "@/stores/editor-store";
import type { ActiveTool } from "@/stores/editor-store";

interface ToolButtonProps {
  label: string;
  icon: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function ToolButton({
  label,
  icon,
  active = false,
  onClick,
  disabled = false,
}: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`rounded px-2 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-green-600 text-white"
          : "text-gray-300 hover:bg-gray-700 hover:text-white"
      } disabled:cursor-not-allowed disabled:opacity-30`}
    >
      {icon}
    </button>
  );
}

interface ToggleButtonProps {
  label: string;
  icon: string;
  enabled: boolean;
  onClick: () => void;
}

function ToggleButton({ label, icon, enabled, onClick }: ToggleButtonProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`rounded px-2 py-1.5 text-xs font-medium transition ${
        enabled
          ? "bg-blue-600 text-white"
          : "text-gray-400 hover:bg-gray-700 hover:text-white"
      }`}
    >
      {icon}
    </button>
  );
}

export function Toolbar() {
  const activeTool = useEditorStore((s) => s.tool.activeTool);
  const setTool = useEditorStore((s) => s.setTool);
  const showSkeleton = useEditorStore((s) => s.viewer.showSkeleton);
  const showWireframe = useEditorStore((s) => s.viewer.showWireframe);
  const showFoliage = useEditorStore((s) => s.viewer.showFoliage);
  const toggleSkeleton = useEditorStore((s) => s.toggleSkeleton);
  const toggleWireframe = useEditorStore((s) => s.toggleWireframe);
  const toggleFoliage = useEditorStore((s) => s.toggleFoliage);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const undoCount = useEditorStore((s) => s.history.undoStack.length);
  const redoCount = useEditorStore((s) => s.history.redoStack.length);

  const tools: Array<{ id: ActiveTool; label: string; icon: string }> = [
    { id: "orbit", label: "Orbit (O)", icon: "Orbit" },
    { id: "style", label: "Style Mode (S)", icon: "Style" },
    { id: "clipper", label: "Clipper (C)", icon: "Clip" },
  ];

  return (
    <div className="flex items-center gap-1">
      {/* Tool select */}
      <div className="flex items-center gap-0.5 rounded bg-gray-700/50 p-0.5">
        {tools.map((t) => (
          <ToolButton
            key={t.id}
            label={t.label}
            icon={t.icon}
            active={activeTool === t.id}
            onClick={() => setTool(t.id)}
          />
        ))}
      </div>

      <div className="mx-2 h-5 w-px bg-gray-600" />

      {/* View toggles */}
      <div className="flex items-center gap-0.5 rounded bg-gray-700/50 p-0.5">
        <ToggleButton
          label="Toggle Skeleton"
          icon="Skel"
          enabled={showSkeleton}
          onClick={toggleSkeleton}
        />
        <ToggleButton
          label="Toggle Wireframe"
          icon="Wire"
          enabled={showWireframe}
          onClick={toggleWireframe}
        />
        <ToggleButton
          label="Toggle Foliage"
          icon="Leaf"
          enabled={showFoliage}
          onClick={toggleFoliage}
        />
      </div>

      <div className="mx-2 h-5 w-px bg-gray-600" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5">
        <ToolButton
          label="Undo"
          icon="Undo"
          onClick={undo}
          disabled={undoCount === 0}
        />
        <ToolButton
          label="Redo"
          icon="Redo"
          onClick={redo}
          disabled={redoCount === 0}
        />
      </div>
    </div>
  );
}
