import { createApiSuccessResponse } from "../../../lib/api/responses";
import { getPublicServerConfigWithManagedProviders } from "../../../lib/defaultConfig/server";

export async function GET() {
  return createApiSuccessResponse(
    await getPublicServerConfigWithManagedProviders(),
  );
}
