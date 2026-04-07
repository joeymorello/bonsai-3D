import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { createWorkspace } from "@/lib/api";

export function CreateWorkspace() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("");

  const mutation = useMutation({
    mutationFn: createWorkspace,
    onSuccess: (workspace) => {
      navigate(`/workspace/${workspace.id}`);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    mutation.mutate({
      name: name.trim(),
      speciesGuess: species.trim() || undefined,
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <Link to="/" className="text-gray-500 hover:text-gray-700">
            &larr; Back
          </Link>
          <h1 className="text-xl font-bold text-green-800">New Workspace</h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-6 py-12">
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-xl border border-gray-200 bg-white p-8 shadow-sm"
        >
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700"
            >
              Workspace Name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Japanese Maple"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          <div>
            <label
              htmlFor="species"
              className="block text-sm font-medium text-gray-700"
            >
              Species (optional)
            </label>
            <input
              id="species"
              type="text"
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              placeholder="e.g. Acer palmatum"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              If you know the species, enter it here to help with
              reconstruction.
            </p>
          </div>

          {mutation.isError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Failed to create workspace. Please try again.
            </div>
          )}

          <button
            type="submit"
            disabled={mutation.isPending || !name.trim()}
            className="w-full rounded-lg bg-green-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mutation.isPending ? "Creating..." : "Create Workspace"}
          </button>
        </form>
      </main>
    </div>
  );
}
