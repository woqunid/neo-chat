import { NextRequest, NextResponse } from "next/server";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import {
  PROVIDER_ADMIN_ERROR_CODES,
  PROVIDER_ADMIN_SESSION_COOKIE,
  createProviderAdminSessionCookieValue,
  getProviderAdminSessionMaxAgeSeconds,
  isProviderAdminEnabled,
  isValidProviderAdminPassword,
} from "@/lib/security/providerAdminAccess";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: NextRequest) {
  if (!isProviderAdminEnabled()) {
    return noStore(
      NextResponse.json(
        {
          error: "Provider admin password is not configured",
          code: PROVIDER_ADMIN_ERROR_CODES.notConfigured,
        },
        { status: 503 },
      ),
    );
  }

  try {
    const body = (await readJsonRequestBody(request)) as { password?: unknown };
    const password = typeof body.password === "string" ? body.password : "";
    if (!(await isValidProviderAdminPassword(password))) {
      return noStore(
        NextResponse.json(
          {
            error: "Invalid provider admin password",
            code: PROVIDER_ADMIN_ERROR_CODES.invalid,
          },
          { status: 401 },
        ),
      );
    }

    const response = noStore(NextResponse.json({ ok: true }));
    response.cookies.set(
      PROVIDER_ADMIN_SESSION_COOKIE,
      await createProviderAdminSessionCookieValue(),
      {
        ...cookieOptions,
        maxAge: getProviderAdminSessionMaxAgeSeconds(),
      },
    );
    return response;
  } catch (error) {
    return noStore(createApiErrorResponse(error));
  }
}
