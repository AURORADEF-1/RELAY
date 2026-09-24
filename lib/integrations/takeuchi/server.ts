import 'server-only';
import type {NextRequest} from 'next/server';
import {authorizeJcb,getRegistry,jcbJson} from '../jcb/server';
import {projectMachine} from '../jcb/normalize';
import {JcbError} from '../jcb/client';
import {getTakeuchiFleet} from './client';
import {linkTakeuchiMachines} from './normalize';
export const authorizeTakeuchi=(request:NextRequest,adminOnly=false)=>authorizeJcb(request,adminOnly,'takeuchi');
export async function getLinkedTakeuchiFleet(auth:Awaited<ReturnType<typeof authorizeTakeuchi>>){const [fleet,registry,mappings]=await Promise.all([getTakeuchiFleet(),getRegistry(auth),auth.supabase.from('takeuchi_mappings').select('pin,machine_id').order('pin').limit(10000)]);if(mappings.error||(mappings.data?.length??0)>=10000)throw new JcbError('Takeuchi machine linking unavailable.',503);return {machines:linkTakeuchiMachines(fleet.machines,registry,mappings.data??[]).map(m=>projectMachine(m,auth.admin)),checkedAt:fleet.checkedAt,admin:auth.admin,stale:Date.now()-Date.parse(fleet.checkedAt)>1200000};}
export function takeuchiError(error:unknown){return jcbJson({error:error instanceof JcbError?error.message:'Takeuchi Track is temporarily unavailable.'},error instanceof JcbError?error.status:503);}
