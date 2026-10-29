"use client";

import { useRef, useState } from "react";

import { UploadError, prepareLogo, uploadLogo } from "@/lib/upload";

/** The creator's logo: shown from a local preview while it uploads. */
export type Logo = { status: "uploading" | "ready" | "error"; preview: string; url?: string; error?: string };

/**
 * Picks, resizes and uploads a token logo. `settle()` waits for an upload in
 * progress and resolves with the stored URL ("" without a logo), or throws
 * the upload's error.
 */
export function useLogoUpload() {
  const [logo, setState] = useState<Logo | null>(null);
  const current = useRef<Logo | null>(null);
  const job = useRef<Promise<unknown> | null>(null);

  const set = (next: Logo | null) => {
    const prev = current.current?.preview;
    if (prev?.startsWith("blob:") && prev !== next?.preview) URL.revokeObjectURL(prev);
    current.current = next;
    setState(next);
  };

  const pick = (file: File) => {
    const preview = URL.createObjectURL(file);
    set({ status: "uploading", preview });
    job.current = (async () => {
      try {
        const url = await uploadLogo(await prepareLogo(file));
        if (current.current?.preview === preview) set({ status: "ready", preview, url });
      } catch (err) {
        const error = err instanceof UploadError ? err.message : "Upload failed. Please try again.";
        if (current.current?.preview === preview) set({ status: "error", preview, error });
      }
    })();
  };

  // an image already hosted on this site (e.g. a listed profile's picture): no upload needed
  const useHosted = (url: string) => {
    job.current = null;
    set({ status: "ready", preview: url, url });
  };

  const settle = async (): Promise<string> => {
    if (current.current?.status === "uploading") await job.current;
    const l = current.current;
    if (l?.status === "error") throw new UploadError(l.error ?? "The logo didn’t upload.");
    return l?.url ?? "";
  };

  return { logo, pick, useHosted, remove: () => set(null), settle };
}
