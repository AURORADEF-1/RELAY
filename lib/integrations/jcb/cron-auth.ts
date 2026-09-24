import { timingSafeEqual } from "node:crypto";
export function validCronAuthorization(header:string|null,secret:string|undefined){
  if(!secret||!header)return false;
  const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(header);
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
