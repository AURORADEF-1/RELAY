import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), fleet: vi.fn(), faults: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/integrations/jcb/client", () => ({ getJcbFaults: mocks.faults, JcbError: class extends Error { constructor(message: string, public status=502) { super(message); } } }));
vi.mock("@/lib/integrations/jcb/server", () => ({ authorizeJcb: mocks.authorize, getLinkedFleet: mocks.fleet, jcbJson: (data: unknown) => NextResponse.json(data), jcbError: (e: {message:string;status:number}) => NextResponse.json({error:e.message},{status:e.status}) }));
import { GET } from "@/app/api/integrations/jcb/context/route";
const get = (params="pin=TEST") => GET(new NextRequest(`http://localhost/api/integrations/jcb/context?${params}`));
beforeEach(() => {
  vi.clearAllMocks(); mocks.authorize.mockResolvedValue({admin:false});
  mocks.fleet.mockResolvedValue({checkedAt:"2026-09-24T09:00:00Z",machines:[{pin:"TEST",model:"3CX",relay:{machine_number:"MLP-1"},position:{latitude:52,longitude:1,at:"2026-09-20T08:00:00Z"},hours:{value:123,at:"2026-09-21T08:00:00Z"}}]});
  mocks.faults.mockResolvedValue({faults:[{code:"F1",description:"Reported issue",severity:"Minor",at:"2026-09-10T08:00:00Z"}]});
});
it("keeps original position time and correct RELAY reference without fitter health",async()=>{
  const r=await get(); const body=await r.json(); expect(r.status).toBe(200); expect(body.machineReference).toBe("MLP-1"); expect(body.text).toContain("2026-09-20T08:00:00Z"); expect(body.text).not.toContain("Operating hours"); expect(mocks.faults).not.toHaveBeenCalled();
});
it("rejects fitter fault context before calling the upstream",async()=>{
  expect((await get("pin=TEST&fault=F1")).status).toBe(403); expect(mocks.faults).not.toHaveBeenCalled(); expect(mocks.fleet).not.toHaveBeenCalled();
});
it("refuses to prefill an unlinked or missing machine",async()=>{
  expect((await get("pin=MISSING")).status).toBe(409);
  mocks.fleet.mockResolvedValue({machines:[{pin:"TEST",relay:null}]}); expect((await get()).status).toBe(409);
});
it("copies a selected dated fault and hours for an admin",async()=>{
  mocks.authorize.mockResolvedValue({admin:true}); const body=await (await get("pin=TEST&fault=F1")).json();
  expect(body.text).toContain("Operating hours: 123"); expect(body.text).toContain("F1: Reported issue"); expect(body.text).toContain("2026-09-10T08:00:00Z"); expect(body.text).toContain("active/cleared state not supplied");
});
it("rejects a fault that is absent from JCB's returned records",async()=>{
  mocks.authorize.mockResolvedValue({admin:true}); expect((await get("pin=TEST&fault=unknown")).status).toBe(409);
});
