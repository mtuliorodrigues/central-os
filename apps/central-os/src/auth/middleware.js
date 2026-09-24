import { authenticateToken } from "./service.js";

export function bearerToken(req) {
  const value = String(req.headers.authorization || "");
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function authenticated(req) {
  return authenticateToken(bearerToken(req));
}

export function requireMasterAdmin(auth) {
  if (!auth || auth.user.role !== "MASTER_ADMIN") {
    throw Object.assign(new Error("Acesso restrito ao MASTER_ADMIN."), { code: "forbidden", statusCode: 403 });
  }
  return auth;
}
