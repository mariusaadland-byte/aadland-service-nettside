// Adapter for U-38D draft RPC names. Not connected to live routes.
// Caller must provide authorized context and private server DB client.
export function signingDraftStore(s){
 if(!s||typeof s.rpc!=="function")throw Error("SIGNING_STORE_MISSING");
 async function call(name,params,allowed){
  const {data,error}=await s.rpc(name,params);
  if(error||!allowed.includes(data))throw Error("SIGNING_STORE_UNCONFIRMED");
  return data;
 }
 return {
  reserveChallenge({context,challenge,keyId}){
   return call("draft_signing_issue",{p_agreement:context.agreementId,p_customer:context.customerId,p_email:context.email,p_id:challenge.challengeId,p_key:keyId,p_mac:challenge.codeMac,p_issued:challenge.issuedAt,p_document:context.documentDigest,p_quote:context.quoteDigest,p_terms:context.termsVersion},["reserved","limited","unavailable"]);
  },
  revokePending({context,challengeId}){
   return call("draft_signing_revoke",{p_customer:context.customerId,p_agreement:context.agreementId,p_id:challengeId},[true,false]);
  },
  commit(plan){
   if(plan?.status!=="commit_required"||!plan.params)throw Error("SIGNING_COMMIT_REQUIRED");
   return call("draft_signing_commit",plan.params,["signed","wrong_code","stale","closed","expired","limited","unavailable"]);
  }
 };
}
