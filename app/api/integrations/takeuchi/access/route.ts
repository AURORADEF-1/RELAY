import { jcbJson } from "@/lib/integrations/jcb/server";
import type { NextRequest } from "next/server";
import { authorizeTakeuchi, takeuchiError } from "@/lib/integrations/takeuchi/server";
export async function GET(request: NextRequest) {
  try { const auth = await authorizeTakeuchi(request); return jcbJson({ allowed: true, admin: auth.admin }); }
  catch (error) { return takeuchiError(error); }
}
