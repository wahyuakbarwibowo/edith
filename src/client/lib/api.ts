export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Options = { method?: string; body?: unknown; form?: FormData };

export async function api<T = void>(path: string, { method, body, form }: Options = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: method ?? (body !== undefined || form ? "POST" : "GET"),
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  // Session expired mid-use: reload so the app falls back to the login screen.
  if (res.status === 401 && path !== "/users/me" && !path.startsWith("/auth/")) location.assign("/");
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.error ?? res.statusText);
  return res.status === 204 ? (undefined as T) : res.json();
}

/** Fire-and-report for UI actions that don't need their result. */
export const report = (err: unknown) => alert(err instanceof Error ? err.message : String(err));
