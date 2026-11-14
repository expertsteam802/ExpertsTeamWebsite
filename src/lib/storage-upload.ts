import { supabase } from "@/integrations/supabase/client";

type UploadStorageOptions = {
  bucket: string;
  path: string;
  file: File;
  onProgress?: (loaded: number, total: number) => void;
};

/**
 * Upload through Supabase Storage's authenticated REST endpoint so the browser
 * can report real byte-level progress. The publishable API key is public;
 * the user's short-lived access token is used for the actual authorization.
 */
export async function uploadStorageFileWithProgress({
  bucket,
  path,
  file,
  onProgress,
}: UploadStorageOptions): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data.session?.access_token;
  const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"];
  const publishableKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!accessToken || !supabaseUrl || !publishableKey) {
    throw new Error("Your secure upload session is unavailable. Sign in again and retry.");
  }

  const encodedPath = path.split("/").map((part) => encodeURIComponent(part)).join("/");
  const endpoint = supabaseUrl.replace(/\/$/, "") + "/storage/v1/object/" +
    encodeURIComponent(bucket) + "/" + encodedPath;

  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", endpoint);
    request.setRequestHeader("apikey", publishableKey);
    request.setRequestHeader("Authorization", "Bearer " + accessToken);
    request.setRequestHeader("cache-control", "60");
    request.setRequestHeader("x-upsert", "false");
    request.setRequestHeader("content-type", file.type || "application/octet-stream");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(file.size, file.size);
        resolve();
        return;
      }
      let message = "Storage rejected the upload (HTTP " + request.status + ").";
      try {
        const payload = JSON.parse(request.responseText) as { message?: string; error?: string };
        message = payload.message || payload.error || message;
      } catch {
        if (request.responseText) message = request.responseText.slice(0, 300);
      }
      reject(new Error(message));
    };
    request.onerror = () => reject(new Error("Network error while uploading. Check your connection and retry."));
    request.onabort = () => reject(new Error("The upload was cancelled."));
    request.send(file);
  });
}
