import { NextRequest, NextResponse } from "next/server";
import { readJsonRequestBody } from "@/lib/api/middleware";
import {
  SUPERADMIN_SESSION_COOKIE,
  createSuperadminSession,
  isSuperadminPasswordEnabled,
  isValidSuperadminPassword,
} from "@/lib/security/superadminAccess";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;

export async function POST(request: NextRequest) {
  if (!isSuperadminPasswordEnabled()) {
    return NextResponse.json({ ok: true });
  }

  const body = (await readJsonRequestBody(request)) as { password?: unknown };
  const password = typeof body.password === "string" ? body.password : "";
  if (!(await isValidSuperadminPassword(password))) {
    return NextResponse.json(
      {
        error: "Invalid administrator password",
        code: "ACCESS_PASSWORD_INVALID",
      },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SUPERADMIN_SESSION_COOKIE,
    await createSuperadminSession(),
    {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    },
  );
  return response;
}
