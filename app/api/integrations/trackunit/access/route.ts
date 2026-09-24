import { jcbJson } from "@/lib/integrations/jcb/server";
import type { NextRequest } from "next/server";
import { authorizeTrackunit, trackunitError } from "@/lib/integrations/trackunit/server";
export async function GET(request: NextRequest) {
  try { const auth = await authorizeTrackunit(request); return jcbJson({ allowed: true, admin: auth.admin }); }
  catch (error) { return trackunitError(error); }
}
