import "server-only";
import {randomUUID} from "node:crypto";

// Fail-closed exclusive lock for ALL automatic writes affecting the Vipps
// settlement customer. An unresolved Tripletex write retains its lock until
// an accountant verifies the remote ledger and resolves it explicitly.
export async function acquireVippsAccountingLock(s,environment,unit){
 if(!["production","test"].includes(environment)||unit!=="service")
  throw Error("Ugyldig Vipps-regnskapsmiljø.");
 const token=randomUUID();
 const {error}=await s.from("tripletex_vipps_accounting_lock")
  .insert({environment,unit,token});
 if(error)throw Error("En Vipps-overføring behandles allerede, eller må kontrolleres manuelt. "+
  "Ikke send nye oppgjør før den er avklart.");
 return token;
}
export async function releaseVippsAccountingLock(s,environment,unit,token){
 const {error}=await s.from("tripletex_vipps_accounting_lock").delete()
  .eq("environment",environment).eq("unit",unit).eq("token",token);
 if(error)throw Error("Kunne ikke frigjøre Vipps-regnskapslåsen. Manuell kontroll kreves.");
}
