import { cookies } from "next/headers";
import SuperAdminPage from "@/components/superadmin/SuperAdminPage";
import AccessPasswordPage from "@/components/app/AccessPasswordPage";
import {
  SUPERADMIN_SESSION_COOKIE,
  isSuperadminPasswordEnabled,
  isValidSuperadminSession,
} from "@/lib/security/superadminAccess";

export default async function Page() {
  if (isSuperadminPasswordEnabled()) {
    const cookieStore = await cookies();
    const session = cookieStore.get(SUPERADMIN_SESSION_COOKIE)?.value;
    if (!(await isValidSuperadminSession(session))) {
      return <AccessPasswordPage verifyPath="/api/superadmin/access/verify" />;
    }
  }

  return <SuperAdminPage />;
}
