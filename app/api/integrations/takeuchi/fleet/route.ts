import { jcbJson } from "@/lib/integrations/jcb/server";
import type { NextRequest } from "next/server";
import { authorizeTakeuchi, getLinkedTakeuchiFleet, takeuchiError } from "@/lib/integrations/takeuchi/server";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try { return jcbJson(await getLinkedTakeuchiFleet(await authorizeTakeuchi(request))); }
  catch (error) { return takeuchiError(error); }
}
