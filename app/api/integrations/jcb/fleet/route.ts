import type { NextRequest } from "next/server";
import { authorizeJcb, getLinkedFleet, jcbError, jcbJson } from "@/lib/integrations/jcb/server";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try { return jcbJson(await getLinkedFleet(await authorizeJcb(request))); }
  catch (error) { return jcbError(error); }
}
