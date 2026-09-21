export async function localApiFetch(path, options = {}) {
  const targets = [
    path,
    `http://127.0.0.1:8787${path}`
  ];

  let lastError;
  for (const url of targets) {
    try {
      const response = await fetch(url, { cache: "no-store", ...options });
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
    } catch (error) {
      lastError = error;
      if (error?.status === 409 || error?.status === 400 || error?.status === 413) throw error;
    }
  }

  throw lastError || new Error("Motor local indisponível.");
}
