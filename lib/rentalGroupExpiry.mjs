export const GROUP_HOLD_MINUTES=30;
export function groupExpiryDecision({status,expiresAt,paymentReference,paymentStarted,childrenSafe,now}){
 const deadline=Date.parse(expiresAt),clock=Date.parse(now);
 if(!Number.isFinite(deadline)||!Number.isFinite(clock)||typeof paymentStarted!=="boolean"||typeof childrenSafe!=="boolean")return "review";
 if(status==="released")return "no_change";
 if(status!=="held"||paymentReference||paymentStarted)return "keep";
 if(!childrenSafe)return "review";
 return clock>=deadline?"release_once":"keep";
}
