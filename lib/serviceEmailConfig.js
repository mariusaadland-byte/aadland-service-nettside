import "server-only";

const DEFAULT_SERVICE_FROM="Aadland Service <noreply@aadland-service.no>";
const DEFAULT_SERVICE_REPLY_TO="post@aadland-service.no";

export function serviceEmailFrom(){
 const configured=String(process.env.SERVICE_EMAIL_FROM||"").trim();
 return configured.replace(/(^|<)noreplay@aadland-service\.no(?=>?$)/i,"$1noreply@aadland-service.no")||DEFAULT_SERVICE_FROM;
}

export function serviceReplyTo(){
 const configured=String(process.env.SERVICE_REPLY_TO||"").trim();
 return configured||DEFAULT_SERVICE_REPLY_TO;
}
