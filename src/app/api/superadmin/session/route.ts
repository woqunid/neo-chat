import { NextRequest, NextResponse } from "next/server";
import {
  PROVIDER_ADMIN_SESSION_COOKIE,
  isProviderAdminEnabled,
  isValidProviderAdminSessionCookie,
} from "@/lib/security/providerAdminAccess";

export async function GET(request: NextRequest) {
  const enabled = isProviderAdminEnabled();
  const verified =
    enabled &&
    (await isValidProviderAdminSessionCookie(
      request.cookies.get(PROVIDER_ADMIN_SESSION_COOKIE)?.value,
    ));
  const response = NextResponse.json({ enabled, verified });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
