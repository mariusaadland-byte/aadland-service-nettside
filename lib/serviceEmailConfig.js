import "server-only";

const DEFAULT_SERVICE_FROM="Aadland Service <noreplay@aadland-service.no>";
const DEFAULT_SERVICE_REPLY_TO="post@aadland-service.no";

export function serviceEmailFrom(){
 const configured=String(process.env.SERVICE_EMAIL_FROM||"").trim();
 return configured||DEFAULT_SERVICE_FROM;
}

export function serviceReplyTo(){
 const configured=String(process.env.SERVICE_REPLY_TO||"").trim();
 return configured||DEFAULT_SERVICE_REPLY_TO;
}
