"use client";

import AwsS3 from "@uppy/aws-s3";
import Uppy from "@uppy/core";
import { useUppyEvent, useUppyState } from "@uppy/react";
import {
  VIDEO_PART_SIZE_BYTES,
  type CreateVideoUploadResponse,
  type SignVideoPartsResponse,
} from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

/**
 * Multipart upload straight to storage: the API only hands out pre-signed
 * part URLs, so the original file leaves the browser byte-identical —
 * no client-side re-encode that would smear fast strokes.
 */
function createUppy(): Uppy {
  const uppy = new Uppy({
    restrictions: { allowedFileTypes: ["video/*"] },
    autoProceed: true,
  });

  const videoIdOf = (file: { meta: Record<string, unknown> }): string => {
    const videoId = file.meta.videoId;
    if (typeof videoId !== "string") throw new Error("Upload not initiated");
    return videoId;
  };

  uppy.use(AwsS3, {
    shouldUseMultipart: true,
    getChunkSize: () => VIDEO_PART_SIZE_BYTES,
    async createMultipartUpload(file) {
      const response = await apiFetch("/videos", {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name ?? "video",
          contentType: file.type || "video/mp4",
          sizeBytes: file.size ?? 0,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        throw new Error(
          Array.isArray(body?.message)
            ? body.message.join(", ")
            : (body?.message ?? `Upload init failed (${response.status})`),
        );
      }
      const data = (await response.json()) as CreateVideoUploadResponse;
      uppy.setFileMeta(file.id, { videoId: data.videoId });
      return { uploadId: data.uploadId, key: data.key };
    },
    async signPart(file, { partNumber }) {
      const response = await apiFetch(`/videos/${videoIdOf(file)}/parts`, {
        method: "POST",
        body: JSON.stringify({ partNumbers: [partNumber] }),
      });
      if (!response.ok)
        throw new Error(`Part signing failed (${response.status})`);
      const data = (await response.json()) as SignVideoPartsResponse;
      return { method: "PUT", url: data.urls[0].url };
    },
    // Parts are tracked client-side within the session; there is no
    // server-side listing, so a restored page starts the file over.
    listParts: () => [],
    async completeMultipartUpload(file, { parts }) {
      const response = await apiFetch(`/videos/${videoIdOf(file)}/complete`, {
        method: "POST",
        body: JSON.stringify({
          parts: parts.map((part) => ({
            partNumber: part.PartNumber,
            etag: part.ETag,
          })),
        }),
      });
      if (!response.ok)
        throw new Error(`Completion failed (${response.status})`);
      return {};
    },
    async abortMultipartUpload(file) {
      const videoId = file.meta.videoId;
      if (typeof videoId === "string") {
        await apiFetch(`/videos/${videoId}`, { method: "DELETE" });
      }
    },
  });
  return uppy;
}

export function VideoUploader() {
  const t = useTranslations("videos.upload");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uppy] = useState(createUppy);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const files = useUppyState(uppy, (state) => Object.values(state.files));
  const totalProgress = useUppyState(uppy, (state) => state.totalProgress);

  useUppyEvent(uppy, "complete", (result) => {
    if (
      (result.failed?.length ?? 0) === 0 &&
      (result.successful?.length ?? 0) > 0
    ) {
      router.push("/dashboard/videos");
      router.refresh();
    }
  });
  useUppyEvent(uppy, "upload-error", (_file, uploadError) => {
    setError(uploadError.message);
  });

  function addFiles(list: FileList | File[]) {
    setError(null);
    for (const file of Array.from(list)) {
      try {
        uppy.addFile({ name: file.name, type: file.type, data: file });
      } catch {
        // Restriction errors (non-video files) surface via uppy.info; keep quiet here.
        setError(t("notAVideo"));
      }
    }
  }

  const uploading = files.some(
    (file) => file.progress?.uploadStarted && !file.progress?.uploadComplete,
  );

  return (
    <div>
      <div className="rounded-card border border-border bg-bg-secondary p-4 text-sm text-text-secondary">
        💡 {t("qualityHint")}
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter") inputRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          addFiles(event.dataTransfer.files);
        }}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed p-12 text-center transition-colors ${
          dragOver
            ? "border-text bg-bg-hover"
            : "border-border-strong bg-bg hover:bg-bg-secondary"
        }`}
      >
        <div className="text-4xl">📹</div>
        <div className="mt-3 font-semibold text-text">{t("dropTitle")}</div>
        <p className="mt-1 text-sm text-text-secondary">{t("dropSubtitle")}</p>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {error ? (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => uppy.retryAll()}>
            {t("retry")}
          </Button>
        </div>
      ) : null}

      {files.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {files.map((file) => {
            const percentage = file.progress?.percentage ?? 0;
            return (
              <li
                key={file.id}
                className="rounded-lg border border-border bg-bg px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-text">
                    {file.name}
                  </span>
                  <span className="shrink-0 text-text-secondary">
                    {file.progress?.uploadComplete
                      ? t("done")
                      : `${percentage}%`}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-secondary">
                  <div
                    className="h-full rounded-full bg-text transition-[width]"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {uploading ? (
        <p className="mt-4 text-sm text-text-secondary">
          {t("uploadingNote", { progress: totalProgress })}
        </p>
      ) : null}
    </div>
  );
}
