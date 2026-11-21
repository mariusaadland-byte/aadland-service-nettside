// Resend retains idempotency keys for 24 hours. Never send an old
// purring/inkassovarsel again simply because our database did not confirm it.
// Use a 23-hour margin from the *original notice row creation* (not the
// latest retry), and require manual Resend reconciliation after expiry.
export const INVOICE_REMINDER_RETRY_WINDOW_MS=23*60*60*1000;
export const INVOICE_REMINDER_RETRY_BLOCKED_MESSAGE=
 "Dette varselet har en gammel eller ukjent sendestatus. Kontroller meldingen i Resend og avstem fakturaen før videre handling. Det kan allerede være sendt; ingen ny e-post blir sendt automatisk.";

export function invoiceReminderRetryAllowed(record,now=Date.now()){
 if(!record||!["pending","failed"].includes(record.status))return false;
 const createdAt=Date.parse(String(record.created_at||""));
 const moment=now instanceof Date?now.getTime():Number(now);
 if(!Number.isFinite(createdAt)||!Number.isFinite(moment))return false;
 const age=moment-createdAt;
 return age>=-5*60*1000&&age<INVOICE_REMINDER_RETRY_WINDOW_MS;
}
