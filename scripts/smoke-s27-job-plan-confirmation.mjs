import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const sql=read("supabase/migrations/20261122221000_s27_job_plan_confirmation_once.sql");
const api=read("app/api/admin/jobs/plan/route.js");
const ui=read("app/admin/oppdrag/[id]/planlegg/PlanJobClient.js");
for(const fragment of [
 "create table public.job_plan_confirmation_attempts",
 "unique(order_id,plan_revision)",
 "alter table public.job_plan_confirmation_attempts enable row level security",
 "revoke all on public.job_plan_confirmation_attempts from public,anon,authenticated",
 "create function public.save_job_plan_once(",
 "for update",
 "S27_STALE_PLAN",
 "changed:=o.job_start_at is distinct from p_start_at",
 "elsif o.job_plan_revision is null",
 "create function public.claim_job_plan_confirmation(",
 "on conflict on constraint s27_unique_plan_confirmation do nothing",
 "state in ('sending','needs_review')",
 "create function public.hold_job_plan_confirmation(",
 "create function public.ack_job_plan_confirmation(",
 "job_plan_revision=a.plan_revision",
 "create function public.review_job_plan_confirmation(",
 "S27_STILL_SENDING",
 "grant execute on function public.claim_job_plan_confirmation(uuid,uuid,text) to service_role"
])assert.ok(sql.includes(fragment),"S27 SQL missing: "+fragment);
for(const frag of [
 'process.env.VERCEL_ENV!=="production"',
 's.rpc("save_job_plan_once"',
 's.rpc("claim_job_plan_confirmation"',
 's.rpc("ack_job_plan_confirmation"',
 's.rpc("hold_job_plan_confirmation"',
 's.rpc("review_job_plan_confirmation"',
 'idempotencyKey:"job-plan-confirmation/"+attempt.id',
 'sent?.error||!sent?.data?.id',
 'provider_status_uncertain',
 'user.role!=="owner"',
 'jobDelivery(s,id,',
 'planRevision:o.job_plan_revision',
 'Number(new Date(now.job_start_at))!==Number(new Date(saved.data.job_start_at))'
])assert.ok(api.includes(frag),"S27 API missing: "+frag);
assert.ok(!api.includes("RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY"));
assert.ok(!api.includes('.update({job_confirmation_sent_at:sentAt'));
assert.ok(ui.includes('blockedByUnresolved'));
assert.ok(ui.includes('Lagre kontroll uten ny sending'));
assert.ok(ui.includes('window.confirm("Lagre planen og sende bekreftelse'));
console.log("S-27: atomisk per-plan sendelås, Resend-idempotens, ukjent status, revisjonssperre og eierkontroll.");
