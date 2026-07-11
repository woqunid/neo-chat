import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_ATTEMPTS_COOKIE,
  ACCESS_ERROR_CODES,
  ACCESS_SESSION_COOKIE,
  getAccessAttemptState,
  isAccessLocked,
  isAccessPasswordEnabled,
  isValidAccessSessionCookie,
} from "./lib/security/accessControl";
import { applyRequestGuards } from "./lib/security/requestGuards";
import { REQUEST_PROOF_SESSION_PATH } from "./lib/security/requestProof";
import {
  SUPERADMIN_SESSION_COOKIE,
  isSuperadminPasswordEnabled,
  isValidSuperadminSession,
} from "./lib/security/superadminAccess";

const ACCESS_VERIFY_PATH = "/api/access/verify";
const SUPERADMIN_VERIFY_PATH = "/api/superadmin/access/verify";

async function requireSuperadminAccess(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/api/superadmin")) return null;
  if (pathname === SUPERADMIN_VERIFY_PATH) return null;
  if (!isSuperadminPasswordEnabled()) return null;
  const session = request.cookies.get(SUPERADMIN_SESSION_COOKIE)?.value;
  if (await isValidSuperadminSession(session)) return null;
  return jsonError(401, {
    error: "Administrator password is required",
    code: ACCESS_ERROR_CODES.required,
  });
}

function jsonError(
  status: number,
  payload: Record<string, unknown>,
): NextResponse {
  const response = NextResponse.json(
    { ...payload, statusCode: status },
    { status },
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function middleware(request: NextRequest) {
  const guardResponse = await applyRequestGuards(request);
  if (guardResponse) return guardResponse;

  const superadminResponse = await requireSuperadminAccess(request);
  if (superadminResponse) return superadminResponse;

  if (!isAccessPasswordEnabled()) {
    return NextResponse.next();
  }

  if (
    request.nextUrl.pathname === ACCESS_VERIFY_PATH ||
    request.nextUrl.pathname === REQUEST_PROOF_SESSION_PATH
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(ACCESS_SESSION_COOKIE)?.value;
  if (await isValidAccessSessionCookie(sessionCookie)) {
    return NextResponse.next();
  }

  const attemptState = await getAccessAttemptState(
    request.cookies.get(ACCESS_ATTEMPTS_COOKIE)?.value,
  );
  if (isAccessLocked(attemptState)) {
    return jsonError(423, {
      error: "Access is temporarily locked",
      code: ACCESS_ERROR_CODES.locked,
      lockedUntil: attemptState.lockedUntil,
    });
  }

  return jsonError(401, {
    error: "Access password is required",
    code: ACCESS_ERROR_CODES.required,
  });
}

export const config = {
  matcher: "/api/:path*",
};
