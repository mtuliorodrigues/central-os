export async function localApiFetch(path, options = {}) {
  const response = await fetch(path, { cache: "no-store", ...options });
  let body = null;
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    try { body = await response.json(); } catch {}
  }
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = body?.code;
    error.body = body;
    throw error;
  }
  return body ?? response;
}
