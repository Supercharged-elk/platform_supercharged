/**
 * Fetch wrapper con JWT auto-inyectado desde Supabase.
 */
import { supabase } from "./supabase";

// All canvas API calls go through Next.js API routes — no separate backend needed.
// Studio uses /api/studio/*, Canvas uses /api/canvas/*.
const BACKEND_URL = "/api/canvas";

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BACKEND_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = (error as { detail?: unknown }).detail;
    const detailText =
      typeof detail === "string"
        ? detail
        : detail !== undefined
          ? JSON.stringify(detail)
          : `API error ${res.status}`;
    throw new Error(detailText);
  }

  return res.json() as Promise<T>;
}

export async function apiRequestForm<T = unknown>(
  path: string,
  formData: FormData,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    method: options.method || "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = (error as { detail?: unknown }).detail;
    const detailText =
      typeof detail === "string"
        ? detail
        : detail !== undefined
          ? JSON.stringify(detail)
          : `API error ${res.status}`;
    throw new Error(detailText);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiRequest<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
  postForm: <T>(path: string, formData: FormData) => apiRequestForm<T>(path, formData),
};
