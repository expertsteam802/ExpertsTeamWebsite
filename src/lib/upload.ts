import { supabase } from "@/integrations/supabase/client";

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200MB hard limit

type UploadArgs = {
  file: File;
  userId: string;
  onProgress: (percent: number) => void;
};

/**
 * Uploads straight to storage over XHR so we can report real upload percentage
 * (the JS client does not expose progress events).
 */
export async function uploadWithProgress({
  file,
  userId,
  onProgress,
}: UploadArgs): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("That file is larger than the 200MB upload limit.");
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You need to be signed in to upload.");

  const safeName = file.name.replace(/[^\w.-]+/g, "_");
  const path = `${userId}/${Date.now()}-${safeName}`;
  const baseUrl = import.meta.env["VITE_SUPABASE_URL"];
  const apiKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${baseUrl}/storage/v1/object/uploads/${path}`);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", apiKey);
    xhr.setRequestHeader("x-upsert", "false");
    if (file.type) xhr.setRequestHeader("content-type", file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.send(file);
  });

  return path;
}

export async function signedUrlFor(path: string) {
  const { data, error } = await supabase.storage.from("uploads").createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}
