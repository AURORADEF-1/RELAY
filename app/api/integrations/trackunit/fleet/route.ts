import { jcbJson } from "@/lib/integrations/jcb/server";
import type { NextRequest } from "next/server";
import { authorizeTrackunit, getLinkedTrackunitFleet, trackunitError } from "@/lib/integrations/trackunit/server";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try { return jcbJson(await getLinkedTrackunitFleet(await authorizeTrackunit(request))); }
  catch (error) { return trackunitError(error); }
}
