import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getWorkspace,
  listPhotos,
  listVariations,
  getReconstructionStatus,
  startReconstruction,
} from "@/lib/api";
import { PhotoUpload } from "@/components/photo-upload";
import { VariationGallery } from "@/components/variation-gallery";

const MIN_PHOTOS_FOR_RECONSTRUCTION = 8;

export function WorkspaceView() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: workspace, isLoading: wsLoading } = useQuery({
    queryKey: ["workspace", id],
    queryFn: () => getWorkspace(id!),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data?.status === "processing" ? 3000 : false,
  });

  const { data: photos } = useQuery({
    queryKey: ["photos", id],
    queryFn: () => listPhotos(id!),
    enabled: !!id,
  });

  const { data: variations } = useQuery({
    queryKey: ["variations", id],
    queryFn: () => listVariations(id!),
    enabled: !!id,
  });

  const { data: reconData } = useQuery({
    queryKey: ["reconstruction-status", id],
    queryFn: () => getReconstructionStatus(id!),
    enabled: !!id && workspace?.status === "processing",
    refetchInterval: workspace?.status === "processing" ? 3000 : false,
  });

  const reconStatus = reconData
    ? {
        step: reconData.latest?.step ?? "unknown",
        progress: 0,
        logs: reconData.latest?.logs ? [reconData.latest.logs] : [],
        error: reconData.latest?.status === "failed" ? "Reconstruction failed" : null,
      }
    : null;

  const startReconMutation = useMutation({
    mutationFn: () => startReconstruction(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace", id] });
    },
  });

  if (wsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500">
        Loading workspace...
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500">
        Workspace not found.
      </div>
    );
  }

  const canReconstruct =
    (photos?.length ?? 0) >= MIN_PHOTOS_FOR_RECONSTRUCTION &&
    workspace.status !== "processing" &&
    workspace.status !== "ready";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-gray-500 hover:text-gray-700">
              &larr; Back
            </Link>
            <h1 className="text-xl font-bold text-gray-900">
              {workspace.name}
            </h1>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                workspace.status === "ready"
                  ? "bg-green-100 text-green-700"
                  : workspace.status === "processing"
                    ? "bg-yellow-100 text-yellow-800"
                    : workspace.status === "failed"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-200 text-gray-700"
              }`}
            >
              {workspace.status}
            </span>
          </div>

          {workspace.status === "ready" && (
            <Link
              to={`/workspace/${id}/editor`}
              className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-800"
            >
              Open Editor
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {/* Photo Upload Section */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-gray-800">Photos</h2>
          <PhotoUpload workspaceId={id!} />

          {/* Photo Gallery */}
          {photos && photos.length > 0 && (
            <div className="mt-4">
              <p className="mb-3 text-sm text-gray-500">
                {photos.length} photo{photos.length !== 1 ? "s" : ""} uploaded
              </p>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="group relative aspect-square overflow-hidden rounded-lg bg-gray-200"
                  >
                    {(photo as unknown as { url?: string }).url ? (
                      <img
                        src={(photo as unknown as { url: string }).url}
                        alt="Bonsai photo"
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-gray-400">
                        {(photo as unknown as { storageKey: string }).storageKey?.split("/").pop()?.slice(0, 8)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Reconstruction Section */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-gray-800">
            3D Reconstruction
          </h2>

          {workspace.status === "processing" && reconStatus && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-6">
              <div className="mb-2 flex items-center justify-between text-sm font-medium text-yellow-800">
                <span>{reconStatus.step}</span>
                <span>{Math.round(reconStatus.progress * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-yellow-200">
                <div
                  className="h-full rounded-full bg-yellow-500 transition-all"
                  style={{ width: `${reconStatus.progress * 100}%` }}
                />
              </div>
              {reconStatus.logs.length > 0 && (
                <pre className="mt-4 max-h-40 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-300">
                  {reconStatus.logs.join("\n")}
                </pre>
              )}
              {reconStatus.error && (
                <p className="mt-2 text-sm text-red-600">
                  Error: {reconStatus.error}
                </p>
              )}
            </div>
          )}

          {workspace.status !== "processing" &&
            workspace.status !== "ready" && (
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <p className="mb-4 text-sm text-gray-600">
                  Upload at least {MIN_PHOTOS_FOR_RECONSTRUCTION} photos of your
                  bonsai from different angles, then start reconstruction.
                </p>
                <p className="mb-4 text-sm text-gray-500">
                  Currently: {photos?.length ?? 0} photo
                  {(photos?.length ?? 0) !== 1 ? "s" : ""} uploaded
                </p>
                <button
                  onClick={() => startReconMutation.mutate()}
                  disabled={!canReconstruct || startReconMutation.isPending}
                  className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {startReconMutation.isPending
                    ? "Starting..."
                    : "Start Reconstruction"}
                </button>
              </div>
            )}

          {workspace.status === "ready" && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-6">
              <p className="text-sm font-medium text-green-800">
                Reconstruction complete! Your 3D model is ready.
              </p>
              <Link
                to={`/workspace/${id}/editor`}
                className="mt-3 inline-block rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-800"
              >
                Open Editor
              </Link>
            </div>
          )}
        </section>

        {/* Variations Section */}
        {workspace.status === "ready" && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-gray-800">
              Style Variations
            </h2>
            <VariationGallery
              workspaceId={id!}
              variations={variations ?? []}
            />
          </section>
        )}
      </main>
    </div>
  );
}
