export let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api(path: string, body?: unknown) {
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers:
        body === undefined
          ? {}
          : { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("No connection. Check your internet and try again.", 0);
  }
  const data = await response
    .json()
    .catch(() => ({ error: "The server is unavailable. Try again." }));
  if (!response.ok)
    throw new ApiError(
      data.error || "Unable to complete the request",
      response.status,
    );
  return data;
}
