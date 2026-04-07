import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/api";

interface UploadItem {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

interface PhotoUploadProps {
  workspaceId: string;
}

export function PhotoUpload({ workspaceId }: PhotoUploadProps) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const uploadFile = useCallback(
    async (file: File, index: number) => {
      try {
        setUploads((prev) =>
          prev.map((u, i) =>
            i === index ? { ...u, status: "uploading" as const } : u,
          ),
        );

        const formData = new FormData();
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/workspaces/${workspaceId}/uploads`);

        const token = getAuthToken();
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const progress = e.loaded / e.total;
            setUploads((prev) =>
              prev.map((u, i) => (i === index ? { ...u, progress } : u)),
            );
          }
        };

        await new Promise<void>((resolve, reject) => {
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload failed: ${xhr.status}`));
          };
          xhr.onerror = () => reject(new Error("Upload network error"));
          xhr.send(formData);
        });

        setUploads((prev) =>
          prev.map((u, i) =>
            i === index
              ? { ...u, status: "done" as const, progress: 1 }
              : u,
          ),
        );

        queryClient.invalidateQueries({ queryKey: ["photos", workspaceId] });
      } catch (err) {
        setUploads((prev) =>
          prev.map((u, i) =>
            i === index
              ? {
                  ...u,
                  status: "error" as const,
                  error: err instanceof Error ? err.message : "Upload failed",
                }
              : u,
          ),
        );
      }
    },
    [workspaceId, queryClient],
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (imageFiles.length === 0) return;

      const startIndex = uploads.length;
      const newUploads: UploadItem[] = imageFiles.map((file) => ({
        file,
        progress: 0,
        status: "pending" as const,
      }));

      setUploads((prev) => [...prev, ...newUploads]);

      imageFiles.forEach((file, i) => {
        uploadFile(file, startIndex + i);
      });
    },
    [uploads.length, uploadFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const activeUploads = uploads.filter((u) => u.status !== "done");
  const doneCount = uploads.filter((u) => u.status === "done").length;

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition ${
          isDragging
            ? "border-green-500 bg-green-50"
            : "border-gray-300 bg-white hover:border-gray-400"
        }`}
      >
        <svg
          className="mb-3 h-10 w-10 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className="text-sm font-medium text-gray-700">
          Drag &amp; drop photos here
        </p>
        <p className="mt-1 text-xs text-gray-500">
          or click to browse. Supports JPG, PNG, HEIC.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {doneCount > 0 && activeUploads.length === 0 && (
        <p className="text-sm text-green-600">
          {doneCount} photo{doneCount !== 1 ? "s" : ""} uploaded successfully
        </p>
      )}

      {/* Upload progress */}
      {activeUploads.length > 0 && (
        <div className="space-y-2">
          {activeUploads.map((upload, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3"
            >
              <div className="flex-1 truncate text-sm text-gray-700">
                {upload.file.name}
              </div>
              {upload.status === "uploading" && (
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{ width: `${upload.progress * 100}%` }}
                  />
                </div>
              )}
              {upload.status === "pending" && (
                <span className="text-xs text-gray-400">Waiting...</span>
              )}
              {upload.status === "error" && (
                <span className="text-xs text-red-500">
                  {upload.error ?? "Failed"}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
