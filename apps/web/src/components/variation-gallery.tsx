import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createVariation, deleteVariation } from "@/lib/api";
import type { Variation } from "@/lib/api";

interface VariationGalleryProps {
  workspaceId: string;
  variations: Variation[];
}

export function VariationGallery({
  workspaceId,
  variations,
}: VariationGalleryProps) {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: { name: string; sourceVariationId?: string }) =>
      createVariation(workspaceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["variations", workspaceId],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (variationId: string) =>
      deleteVariation(variationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["variations", workspaceId],
      });
    },
  });

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {variations.map((variation) => (
          <div
            key={variation.id}
            className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
          >
            {/* Thumbnail */}
            <div className="aspect-video w-full bg-gray-100">
              {variation.thumbnailUrl ? (
                <img
                  src={variation.thumbnailUrl}
                  alt={variation.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-400">
                  <svg
                    className="h-8 w-8"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Info + Actions */}
            <div className="p-3">
              <h4 className="truncate text-sm font-medium text-gray-900">
                {variation.name}
              </h4>
              <p className="mt-0.5 text-xs text-gray-500">
                {variation.operations.length} operation
                {variation.operations.length !== 1 ? "s" : ""} &middot;{" "}
                {new Date(variation.updatedAt).toLocaleDateString()}
              </p>

              <div className="mt-3 flex items-center gap-2">
                <Link
                  to={`/workspace/${workspaceId}/editor?variation=${variation.id}`}
                  className="rounded bg-green-700 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-green-800"
                >
                  Open
                </Link>
                <button
                  onClick={() =>
                    createMutation.mutate({
                      name: `${variation.name} (copy)`,
                      sourceVariationId: variation.id,
                    })
                  }
                  className="rounded bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-200"
                >
                  Duplicate
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${variation.name}"?`)) {
                      deleteMutation.mutate(variation.id);
                    }
                  }}
                  className="rounded px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* New Variation Card */}
        <button
          onClick={() =>
            createMutation.mutate({
              name: `Variation ${variations.length + 1}`,
            })
          }
          disabled={createMutation.isPending}
          className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white p-8 text-gray-400 transition hover:border-green-400 hover:text-green-600"
        >
          <svg
            className="mb-2 h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span className="text-sm font-medium">New Variation</span>
        </button>
      </div>
    </div>
  );
}
