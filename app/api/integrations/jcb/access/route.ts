import type { NextRequest } from "next/server";
import { authorizeJcb, jcbError, jcbJson } from "@/lib/integrations/jcb/server";
export async function GET(request: NextRequest) {
  try { const auth = await authorizeJcb(request); return jcbJson({ allowed: true, admin: auth.admin }); }
  catch (error) { return jcbError(error); }
}
