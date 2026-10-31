import {NextResponse} from "next/server";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import {isValidDateInput,osloDateKey} from "../../../../lib/osloTime";
import {accruedWorkMinutes} from "../../../../lib/workTimeAccumulation";
import {storedWorkStamps,workStamp,normalizeStampEdit} from "../../../../lib/workTimeStamps";
import {netWorkMinutes,validDeductedMinutes} from "../../../../lib/workTimeDeduction";
import {parseWorkClockCustomerRef,resolveWorkClockCustomer} from "../../../../lib/workClockCustomer";

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SELECT_FIELDS="id,admin_user_id,order_id,customer_ref,work_date,project_label,customer_label,note,started_at,ended_at,duration_minutes,hourly_rate_ore,distance_km,km_rate_ore,toll_ore,deducted_minutes,lunch_days,work_sessions,created_at,updated_at";

async function allowed(){
 const user=await getAdminUser();
 if(!user)return null;
 return user.role==="owner"||user.canUpdateOrders?user:null;
}
function clean(value,max=500){
 return String(value??"").trim().slice(0,max);
}
function integer(value,min=0,max=100000000){
 const number=Number(value);
 if(!Number.isFinite(number))return min;
 return Math.max(min,Math.min(max,Math.round(number)));
}
function decimal(value,min=0,max=1000000){
 const number=Number(value);
 if(!Number.isFinite(number))return min;
 return Math.max(min,Math.min(max,Math.round(number*100)/100));
}
function orderId(value){
 const id=clean(value,80);
 return UUID_RE.test(id)?id:null;
}
function map(row){
 if(!row)return null;
 return {
  id:row.id,
  orderId:row.order_id||null,
  customerRef:row.customer_ref||"",
  workDate:row.work_date,
  projectLabel:row.project_label||"",
  customerLabel:row.customer_label||"",
  note:row.note||"",
  startedAt:row.started_at||null,
  endedAt:row.ended_at||null,
  durationMinutes:Number(row.duration_minutes)||0,
  deductedMinutes:Number(row.deducted_minutes)||0,
  lunchDays:Array.isArray(row.lunch_days)?row.lunch_days:[],
  netDurationMinutes:netWorkMinutes(Number(row.duration_minutes)||0,Number(row.deducted_minutes)||0)||0,
  hourlyRateOre:Number(row.hourly_rate_ore)||0,
  distanceKm:Number(row.distance_km)||0,
  kmRateOre:Number(row.km_rate_ore)||0,
  tollOre:Number(row.toll_ore)||0,
  sessions:storedWorkStamps(row),
  createdAt:row.created_at,
  updatedAt:row.updated_at
 };
}
function tableError(error){
 const code=String(error?.code||"");
 const message=String(error?.message||"");
 return code==="42P01"||code==="PGRST205"||message.includes("work_time_entries");
}
function monthBounds(value){
 const month=String(value||"");
 if(!/^\d{4}-\d{2}$/.test(month))return null;
 const [year,monthNo]=month.split("-").map(Number);
 if(year<2020||year>2100||monthNo<1||monthNo>12)return null;
 const next=new Date(Date.UTC(year,monthNo,1));
 return {
  first:month+"-01",
  next:next.toISOString().slice(0,7)+"-01"
 };
}
async function applyCustomerSelection(s,values,customerRef){
 const parsed=parseWorkClockCustomerRef(customerRef);
 if(parsed?.error)return parsed.error;
 if(values.order_id&&parsed)return "Velg enten eksisterende oppdrag eller en kunde uten prosjekt.";
 if(!parsed){values.customer_ref="";return null;}
 const resolved=await resolveWorkClockCustomer(s,parsed.ref);
 if(resolved.error)return resolved.error;
 values.customer_ref=resolved.customerRef;
 values.customer_label=resolved.customerLabel;
 return null;
}
function nextWorkUpdateAt(previous){
 const prior=Date.parse(previous||"");
 return new Date(Math.max(Date.now(),Number.isFinite(prior)?prior+1:0)).toISOString();
}
function commonValues(body){
 return {
  order_id:orderId(body.orderId),
  project_label:clean(body.projectLabel,180),
  customer_label:clean(body.customerLabel,180),
  note:clean(body.note,2000),
  hourly_rate_ore:integer(body.hourlyRateOre,0,10000000),
  distance_km:decimal(body.distanceKm,0,1000000),
  km_rate_ore:integer(body.kmRateOre,0,100000),
  toll_ore:integer(body.tollOre,0,100000000),
  updated_at:new Date().toISOString()
 };
}

export async function GET(req){
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const requested=new URL(req.url).searchParams.get("month")||osloDateKey(new Date()).slice(0,7);
 const bounds=monthBounds(requested);
 if(!bounds)return NextResponse.json({error:"Ugyldig måned."},{status:400});

 const [entriesResult,activeResult]=await Promise.all([
  s.from("work_time_entries")
   .select(SELECT_FIELDS)
   .eq("admin_user_id",user.id)
   .gte("work_date",bounds.first)
   .lt("work_date",bounds.next)
   .order("work_date",{ascending:false})
   .order("created_at",{ascending:false}),
  s.from("work_time_entries")
   .select(SELECT_FIELDS)
   .eq("admin_user_id",user.id)
   .not("started_at","is",null)
   .is("ended_at",null)
   .maybeSingle()
 ]);

 const error=entriesResult.error||activeResult.error;
 if(error){
  if(tableError(error))return NextResponse.json({entries:[],active:null,setupRequired:true},{status:503});
  console.error("WORK TIME GET",error);
  return NextResponse.json({error:"Arbeidstiden kunne ikke hentes."},{status:500});
 }
 // Value credits apply to every time entry on the same order even if the
 // sessions were recorded in different months. Fetch the full work ledger.
 const allWork=[];
 for(let offset=0;offset<5000;offset+=500){
  const page=await s.from("work_time_entries")
   .select("id,order_id,duration_minutes,deducted_minutes,hourly_rate_ore,started_at,ended_at")
   .eq("admin_user_id",user.id).order("id",{ascending:true}).range(offset,offset+499);
  if(page.error||!Array.isArray(page.data))
   return NextResponse.json({error:"Kunne ikke kontrollere prosjektets fulle arbeidstid."},{status:503});
  allWork.push(...page.data);
  if(page.data.length<500)break;
  if(offset===4500)return NextResponse.json({error:"For mange tidsregistreringer for sikker prosjektoversikt."},{status:503});
 }
 const credits=await s.from("work_time_value_credits")
  .select("scope_key,agreed_value_ore,description,updated_at")
  .eq("admin_user_id",user.id);
 if(credits.error)return NextResponse.json({error:"Kunne ikke laste avtalte motregningsverdier."},{status:503});
 const laborOreByScope={},netMinutesByScope={};
 for(const entry of allWork){
  const key=entry.order_id?"order:"+entry.order_id:"entry:"+entry.id;
  const net=netWorkMinutes(Number(entry.duration_minutes)||0,Number(entry.deducted_minutes)||0)||0;
  netMinutesByScope[key]=(netMinutesByScope[key]||0)+net;
  laborOreByScope[key]=(laborOreByScope[key]||0)+Math.round(net*(Number(entry.hourly_rate_ore)||0)/60);
 }
 return NextResponse.json({
  month:requested,
  entries:(entriesResult.data||[]).map(map),
  active:map(activeResult.data),
  credits:(credits.data||[]).map(x=>({scopeKey:x.scope_key,agreedValueOre:Number(x.agreed_value_ore)||0,
   description:x.description,updatedAt:x.updated_at})),
  laborOreByScope,
  netMinutesByScope
 });
}

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await req.json().catch(()=>({}));
 const action=clean(body.action,30);
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 if(action==="setOrderCredit"){
  // Permit a value agreement on an EXISTING project even before a
  // work-clock entry is attached to it. Never trust a project name alone.
  const target=orderId(body.orderId);
  if(!target)return NextResponse.json({error:"Velg et eksisterende oppdrag."},{status:400});
  const {data:order,error:orderError}=await s.from("orders").select("id,order_type,status")
   .eq("id",target).maybeSingle();
  if(orderError)return NextResponse.json({error:"Oppdraget kunne ikke kontrolleres."},{status:503});
  if(!order||order.order_type!=="custom"||order.status==="cancelled")
   return NextResponse.json({error:"Dette oppdraget kan ikke brukes til motregning."},{status:400});
  const amount=Number(body.agreedValueOre);
  if(!Number.isSafeInteger(amount)||amount<0||amount>100000000000)
   return NextResponse.json({error:"Oppgi en gyldig avtalt verdi i kroner."},{status:400});
  const {data,error}=await s.from("work_time_value_credits").upsert({
   admin_user_id:user.id,scope_key:"order:"+target,agreed_value_ore:amount,
   description:clean(body.creditDescription,400),updated_at:new Date().toISOString()
  },{onConflict:"admin_user_id,scope_key"})
   .select("scope_key,agreed_value_ore,description,updated_at").single();
  if(error)return NextResponse.json({error:"Avtalt prosjektverdi kunne ikke lagres."},{status:500});
  return NextResponse.json({credit:{scopeKey:data.scope_key,
   agreedValueOre:Number(data.agreed_value_ore),description:data.description,
   updatedAt:data.updated_at}});
 }
 const values=commonValues(body);
 values.admin_user_id=user.id;

 if(action==="start"){
  values.work_date=osloDateKey(new Date());
  values.started_at=new Date().toISOString();
  values.ended_at=null;
  values.duration_minutes=0;
  const deducted=validDeductedMinutes(body.deductedMinutes??0);
  if(deducted===null)return NextResponse.json({error:"Oppgi gyldig minustid i hele minutter."},{status:400});
  values.deducted_minutes=deducted;
  values.lunch_days=[];
  values.work_sessions=[];
 }else if(action==="manual"){
  const workDate=clean(body.workDate,10);
  const durationMinutes=integer(body.durationMinutes,0,100000);
  if(!isValidDateInput(workDate))return NextResponse.json({error:"Velg en gyldig dato."},{status:400});
  if(durationMinutes<1&&validDeductedMinutes(body.deductedMinutes??0)!==null&&
   Number(body.deductedMinutes??0)===0)
   return NextResponse.json({error:"Oppgi arbeidstid eller minustid for å registrere en negativ startsaldo."},{status:400});
  values.work_date=workDate;
  values.started_at=null;
  values.ended_at=null;
  values.duration_minutes=durationMinutes;
  const deducted=validDeductedMinutes(body.deductedMinutes??0);
  if(deducted===null)
   return NextResponse.json({error:"Oppgi gyldig minustid i hele minutter."},{status:400});
  if(durationMinutes===0&&deducted===0)
   return NextResponse.json({error:"Oppgi arbeidstid eller minustid."},{status:400});
  values.deducted_minutes=deducted;
  values.lunch_days=[];
  values.work_sessions=[];
 }else{
  return NextResponse.json({error:"Ukjent handling."},{status:400});
 }

 const customerIssue=await applyCustomerSelection(s,values,body.customerRef||"");
 if(customerIssue)return NextResponse.json({error:customerIssue},{status:400});
 const {data,error}=await s.from("work_time_entries").insert(values).select(SELECT_FIELDS).single();
 if(error){
  if(tableError(error))return NextResponse.json({error:"Databaseoppdatering mangler for arbeidsklokken.",setupRequired:true},{status:503});
  if(String(error.code||"")==="23505")return NextResponse.json({error:"Du har allerede en arbeidsklokke som går."},{status:409});
  console.error("WORK TIME POST",error);
  return NextResponse.json({error:"Registreringen kunne ikke lagres."},{status:500});
 }
 return NextResponse.json({entry:map(data)});
}

export async function PATCH(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await req.json().catch(()=>({}));
 const id=clean(body.id,80);
 const action=clean(body.action,30);
 if(!UUID_RE.test(id))return NextResponse.json({error:"Registreringen mangler."},{status:400});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 const existingResult=await s.from("work_time_entries").select(SELECT_FIELDS).eq("id",id).eq("admin_user_id",user.id).maybeSingle();
 if(existingResult.error){
  if(tableError(existingResult.error))return NextResponse.json({error:"Databaseoppdatering mangler for arbeidsklokken.",setupRequired:true},{status:503});
  return NextResponse.json({error:"Registreringen kunne ikke hentes."},{status:500});
 }
 const existing=existingResult.data;
 if(!existing)return NextResponse.json({error:"Registreringen ble ikke funnet."},{status:404});

 if(action==="setCredit"){
  // Never use a client-supplied project ID: derive a stable scope from
  // a work record belonging to this authenticated admin.
  const scopeKey=existing.order_id?"order:"+existing.order_id:"entry:"+existing.id;
  const amount=Number(body.agreedValueOre);
  if(!Number.isSafeInteger(amount)||amount<0||amount>100000000000)
   return NextResponse.json({error:"Oppgi en gyldig avtalt verdi i kroner."},{status:400});
  const description=clean(body.creditDescription,400);
  const {data,error}=await s.from("work_time_value_credits").upsert({
   admin_user_id:user.id,scope_key:scopeKey,agreed_value_ore:amount,
   description,updated_at:new Date().toISOString()
  },{onConflict:"admin_user_id,scope_key"})
   .select("scope_key,agreed_value_ore,description,updated_at").single();
  if(error){
   console.error("WORK TIME CREDIT",error.code);
   return NextResponse.json({error:"Avtalt motregningsverdi kunne ikke lagres."},{status:500});
  }
  return NextResponse.json({credit:{scopeKey:data.scope_key,
   agreedValueOre:Number(data.agreed_value_ore),description:data.description,
   updatedAt:data.updated_at}});
 }
 let values;
 if(action==="stop"){
  if(!existing.started_at||existing.ended_at)return NextResponse.json({error:"Denne klokken går ikke."},{status:409});
  const endedAt=new Date();
  const durationMinutes=accruedWorkMinutes(existing.duration_minutes,existing.started_at,endedAt);
  if(durationMinutes===null)return NextResponse.json({error:"Tidsregistreringen kan ikke overstige 100 000 minutter. Kontroller registreringen."},{status:409});
  const lastStamp=workStamp(existing.started_at,endedAt);
  if(!lastStamp)return NextResponse.json({error:"Klokkeslettene kan ikke brukes. Kontroller registreringen."},{status:409});
  values={ended_at:endedAt.toISOString(),duration_minutes:durationMinutes,
   work_sessions:[...storedWorkStamps(existing),lastStamp],updated_at:endedAt.toISOString()};
 }else if(action==="deduct"){
  // One-tap lunch deduction with client snapshot to reject accidental double
  // taps, stale mobile sessions, and concurrent edits from another device.
  if(!existing.started_at||existing.ended_at)
   return NextResponse.json({error:"Lunsjknappen er bare tilgjengelig mens klokken går. Rediger minustid på en avsluttet registrering."},{status:409});
  const delta=Number(body.deltaMinutes);
  if(delta!==30&&delta!==-30)
   return NextResponse.json({error:"Velg lunsjfratrekk på 30 minutter eller angre 30 minutter."},{status:400});
  if(!body.expectedUpdatedAt||body.expectedUpdatedAt!==existing.updated_at)
   return NextResponse.json({error:"Klokken ble endret. Last inn oppdatert tid før du prøver igjen."},{status:409});
  const day=osloDateKey(new Date());
  const days=Array.isArray(existing.lunch_days)?existing.lunch_days:[];
  if(delta===30&&days.includes(day))
   return NextResponse.json({error:"Du har allerede trukket 30 minutter lunsj i dag. Bruk redigering hvis noe skal endres."},{status:409});
  if(delta===-30&&!days.includes(day))
   return NextResponse.json({error:"Det er ikke registrert en lunsj i dag som kan angres."},{status:409});
  const deducted=validDeductedMinutes(Number(existing.deducted_minutes||0)+delta);
  if(deducted===null)
   return NextResponse.json({error:"Minustiden kan ikke være negativ eller overstige 100 000 minutter."},{status:400});
  values={deducted_minutes:deducted,
   lunch_days:delta===30?[...days,day]:days.filter(x=>x!==day),
   updated_at:nextWorkUpdateAt(existing.updated_at)};
 }else if(action==="setDeduction"){
  // Explicitly set a negative starting balance while a timer is running,
  // including an already-started order. Preserve clock-in/out sessions.
  if(!existing.started_at||existing.ended_at)
   return NextResponse.json({error:"Klokken må gå for å endre minustid her. Avsluttede registreringer endres med Rediger."},{status:409});
  if(!body.expectedUpdatedAt||body.expectedUpdatedAt!==existing.updated_at)
   return NextResponse.json({error:"Klokken ble endret. Oppdater siden og prøv på nytt."},{status:409});
  const deducted=validDeductedMinutes(body.deductedMinutes);
  if(deducted===null)return NextResponse.json({error:"Oppgi minustid som et gyldig antall timer."},{status:400});
  const days=Array.isArray(existing.lunch_days)?existing.lunch_days:[];
  values={deducted_minutes:deducted,
   lunch_days:deducted>=30*days.length?days:[],
   updated_at:nextWorkUpdateAt(existing.updated_at)};
 }else if(action==="resume"){
  // Re-use the *same row* only if it was a stopped timer without
  // a linked order. Preserve work date, labels, rates, km and toll.
  if(existing.order_id)return NextResponse.json({error:"Bare timere uten koblet oppdrag kan startes igjen."},{status:409});
  if(!existing.started_at||!existing.ended_at)
   return NextResponse.json({error:"Bare en tidligere stoppet klokke kan fortsettes."},{status:409});
  if(!Number.isSafeInteger(Number(existing.duration_minutes))||
   Number(existing.duration_minutes)<1||Number(existing.duration_minutes)>=100000)
   return NextResponse.json({error:"Denne registreringen kan ikke fortsettes med gyldig timetotal."},{status:409});
  const resumedAt=new Date().toISOString();
  values={started_at:resumedAt,ended_at:null,updated_at:resumedAt};
 }else if(action==="update"){
  if(existing.started_at&&!existing.ended_at)return NextResponse.json({error:"Stopp klokken før du redigerer registreringen."},{status:409});
  const workDate=clean(body.workDate,10);
  const durationMinutes=integer(body.durationMinutes,0,100000);
  if(!isValidDateInput(workDate))return NextResponse.json({error:"Velg en gyldig dato."},{status:400});
  values={...commonValues(body),work_date:workDate,duration_minutes:durationMinutes};
  const customerIssue=await applyCustomerSelection(s,values,body.customerRef??existing.customer_ref??"");
  if(customerIssue)return NextResponse.json({error:customerIssue},{status:400});
  const deducted=validDeductedMinutes(body.deductedMinutes??existing.deducted_minutes??0);
  if(deducted===null)return NextResponse.json({error:"Oppgi gyldig minustid i hele minutter."},{status:400});
  values.deducted_minutes=deducted;
  if(values.duration_minutes===0&&deducted===0)
   return NextResponse.json({error:"Oppgi arbeidstid eller minustid."},{status:400});
  if(Array.isArray(body.sessions)){
   if(!existing.started_at||!existing.ended_at)
    return NextResponse.json({error:"Stemplinger kan bare redigeres når klokken er stoppet."},{status:409});
   const result=normalizeStampEdit(body.sessions,existing);
   if(result.error)return NextResponse.json({error:result.error},{status:400});
   const stamped=result.stamps.filter(x=>x.startedAt&&x.endedAt);
   const last=stamped[stamped.length-1];
   values={...values,work_sessions:result.stamps,duration_minutes:result.minutes,
    started_at:last?.startedAt||existing.started_at,ended_at:last?.endedAt||existing.ended_at};
  }else if(storedWorkStamps(existing).some(x=>x.startedAt&&x.endedAt)&&
   durationMinutes!==existing.duration_minutes){
   return NextResponse.json({error:"Rediger inn- og utstemplingene for å justere timer på en registrering med klokkehistorikk."},{status:409});
  }
 }else{
  return NextResponse.json({error:"Ukjent handling."},{status:400});
 }

 let mutation=s.from("work_time_entries").update(values).eq("id",id).eq("admin_user_id",user.id);
 if(action==="stop"){
  // Two simultaneous Stop requests must not add the same interval twice.
  mutation=mutation.is("ended_at",null).eq("started_at",existing.started_at)
   .eq("duration_minutes",existing.duration_minutes).eq("updated_at",existing.updated_at)
   .eq("deducted_minutes",existing.deducted_minutes);
 }else if(action==="deduct"||action==="setDeduction"){
  mutation=mutation.eq("updated_at",existing.updated_at).is("ended_at",null)
   .eq("deducted_minutes",existing.deducted_minutes);
 }else if(action==="resume"){
  // If this row was changed or resumed from another phone since GET,
  // the conditional update must not overwrite that work session.
  mutation=mutation.eq("ended_at",existing.ended_at).eq("started_at",existing.started_at)
   .eq("duration_minutes",existing.duration_minutes).eq("updated_at",existing.updated_at).is("order_id",null);
 }else if(action==="update"){
  mutation=mutation.eq("duration_minutes",existing.duration_minutes).eq("updated_at",existing.updated_at)
   .eq("deducted_minutes",existing.deducted_minutes);
  if(existing.started_at&&existing.ended_at)mutation=mutation.eq("ended_at",existing.ended_at);
  else mutation=mutation.is("started_at",null);
 }
 const {data,error}=await mutation.select(SELECT_FIELDS).maybeSingle();
 if(error){
  if(String(error.code||"")==="23505")
   return NextResponse.json({error:"Du har allerede en arbeidsklokke som går. Stopp den før du fortsetter en annen."},{status:409});
  if(tableError(error))return NextResponse.json({error:"Databaseoppdatering mangler for arbeidsklokken.",setupRequired:true},{status:503});
  console.error("WORK TIME PATCH",error);
  return NextResponse.json({error:"Registreringen kunne ikke oppdateres."},{status:500});
 }
 if(!data)return NextResponse.json({error:"Timeregistreringen ble endret et annet sted. Oppdater siden og prøv på nytt."},{status:409});
 return NextResponse.json({entry:map(data)});
}

export async function DELETE(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await req.json().catch(()=>({}));
 const id=clean(body.id,80);
 if(!UUID_RE.test(id))return NextResponse.json({error:"Registreringen mangler."},{status:400});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const existing=await s.from("work_time_entries")
  .select("id,started_at,ended_at").eq("id",id).eq("admin_user_id",user.id).maybeSingle();
 if(existing.error){
  if(tableError(existing.error))return NextResponse.json({error:"Databaseoppdatering mangler for arbeidsklokken.",setupRequired:true},{status:503});
  return NextResponse.json({error:"Registreringen kunne ikke hentes."},{status:500});
 }
 if(!existing.data)return NextResponse.json({error:"Registreringen ble ikke funnet."},{status:404});
 if(existing.data.started_at&&!existing.data.ended_at)return NextResponse.json({error:"En aktiv klokke må stoppes før den kan slettes."},{status:409});
 const {error}=await s.from("work_time_entries").delete().eq("id",id).eq("admin_user_id",user.id);
 if(error){
  console.error("WORK TIME DELETE",error);
  return NextResponse.json({error:"Registreringen kunne ikke slettes."},{status:500});
 }
 return NextResponse.json({ok:true});
}
