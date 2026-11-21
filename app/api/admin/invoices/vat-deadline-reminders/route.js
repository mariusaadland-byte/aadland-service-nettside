import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {osloDateKey} from "../../../../../lib/osloTime";
import {vatDeadlineEvents} from "../../../../../lib/vatDeadlineReminders";
export const runtime="nodejs";
export async function GET(){
 const user=await getAdminUser();
 if(user?.role!=="owner")
  return NextResponse.json({error:"Bare eier kan se MVA-fristvarsler."},{status:403});
 const s=db();
 if(!s)return NextResponse.json({error:"Database utilgjengelig."},{status:503});
 const today=osloDateKey(new Date()),year=Number(today.slice(0,4));
 const [profile,terms,reminders]=await Promise.all([
  s.from("vat_reporting_profile").select("first_term_year,first_term,registration_date")
   .eq("id","primary").maybeSingle(),
  s.from("vat_reporting_term_status").select("year,term,status")
   .gte("year",year-1).lte("year",year+1),
  s.from("vat_deadline_reminder_attempts")
   .select("year,term,lead_days,due_date,alert_day,status,claimed_at,sent_at,updated_at")
   .order("claimed_at",{ascending:false}).limit(50)
 ]);
 if(profile.error||terms.error||reminders.error||
    !Array.isArray(terms.data)||!Array.isArray(reminders.data))
  return NextResponse.json({error:"MVA-fristvarsler kan ikke leses. Ikke anta at de er sendt."},{status:503});
 return NextResponse.json({
  today,active:Boolean(profile.data),
  upcoming:vatDeadlineEvents(today,profile.data,terms.data),
  attempts:reminders.data,
  note:"Varsler er interne og bekrefter ikke faktisk innsendt MVA-melding."
 },{headers:{"Cache-Control":"private, no-store"}});
}
