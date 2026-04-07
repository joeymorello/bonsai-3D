import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listWorkspaces } from "@/lib/api";
import type { Workspace } from "@/lib/api";

const STATUS_COLORS: Record<Workspace["status"], string> = {
  created: "bg-gray-200 text-gray-700",
  uploading: "bg-blue-100 text-blue-700",
  processing: "bg-yellow-100 text-yellow-800",
  ready: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
};

function StatusBadge({ status }: { status: Workspace["status"] }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {status}
    </span>
  );
}

function WorkspaceCard({ workspace }: { workspace: Workspace }) {
  return (
    <Link
      to={`/workspace/${workspace.id}`}
      className="group block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="aspect-video w-full bg-gray-100">
        {workspace.coverUrl ? (
          <img
            src={workspace.coverUrl}
            alt={workspace.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400">
            <svg
              className="h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="truncate text-sm font-semibold text-gray-900 group-hover:text-green-700">
            {workspace.name}
          </h3>
          <StatusBadge status={workspace.status} />
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {workspace.photoCount} photo{workspace.photoCount !== 1 ? "s" : ""} &middot;{" "}
          {new Date(workspace.createdAt).toLocaleDateString()}
        </p>
      </div>
    </Link>
  );
}

export function Dashboard() {
  const { data: workspaces, isLoading, error } = useQuery({
    queryKey: ["workspaces"],
    queryFn: listWorkspaces,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-bold text-green-800">Bonsai 3D</h1>
          <Link
            to="/workspace/new"
            className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-800"
          >
            + New Workspace
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">
          Your Workspaces
        </h2>

        {isLoading && (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <svg
              className="mr-2 h-5 w-5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            Loading workspaces...
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Failed to load workspaces. Please try again.
          </div>
        )}

        {workspaces && workspaces.length === 0 && (
          <div className="py-20 text-center text-gray-500">
            <p className="text-lg">No workspaces yet</p>
            <p className="mt-1 text-sm">
              Create your first workspace to get started.
            </p>
          </div>
        )}

        {workspaces && workspaces.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {workspaces.map((ws) => (
              <WorkspaceCard key={ws.id} workspace={ws} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
