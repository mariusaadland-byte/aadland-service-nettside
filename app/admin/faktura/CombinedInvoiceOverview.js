"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {invoicePaymentState} from "../../../lib/invoicePaymentStatus";
import {osloDateKey} from "../../../lib/osloTime";

const kr=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(ore/100);
function combinedInvoiceRows(native,external,today){
 const n=(native||[]).filter(x=>x.status!=="draft").map(x=>{
  const p=invoicePaymentState(x,today);
  return {key:"native:"+x.id,id:x.id,source:"Aadland Service",
   number:String(x.invoice_number||"—"),customer:String(x.customer?.name||""),
   date:x.issued_date||"",due:x.due_date||"",
   total:p.total,paid:p.paid,outstanding:p.outstanding,
   state:p.key,href:"/admin/faktura/arkiv?id="+encodeURIComponent(x.id),
   label:p.label};
 });
 const e=(external||[]).map(x=>{
  const total=Number(x.amount_ore||0),isPaid=x.status==="paid";
  return {key:"external:"+x.id,id:x.id,source:String(x.source_system||"Annet system"),
   number:String(x.invoice_number||"—"),customer:String(x.customer_name||""),
   date:x.issued_on||"",due:x.due_on||"",total,
   paid:isPaid?total:0,outstanding:isPaid?0:total,
   state:isPaid?"paid":x.due_on<today?"overdue":"unpaid",
   href:"/admin/faktura/eksterne?id="+encodeURIComponent(x.id),
   label:isPaid?"Betalt":x.due_on<today?"Forfalt":"Ubetalt"};
 });
 return [...n,...e];
}
export default function CombinedInvoiceOverview({nativeInvoices=[]}){
 const [external,setExternal]=useState([]);
 const [status,setStatus]=useState("loading"),[error,setError]=useState("");
 const [filter,setFilter]=useState("unpaid"),[query,setQuery]=useState("");
 const [open,setOpen]=useState(true);
 const today=osloDateKey(new Date());
 useEffect(()=>{
  let live=true;
  (async()=>{
   try{
    const rows=[];
    for(let offset=0;offset<=10000;offset+=100){
     const resp=await fetch("/api/admin/invoices/external-register?offset="+offset,{cache:"no-store"});
     const data=await resp.json().catch(()=>({}));
     if(!resp.ok||!data.ok)throw Error(data.error||"Eksterne fakturaer kunne ikke hentes.");
     rows.push(...data.invoices);
     if(!data.hasMore){if(live){setExternal(rows);setStatus("ready");}return;}
    }
    throw Error("Det finnes flere fakturaer enn denne oversikten kan vise. Bruk registeret for å se alle.");
   }catch(e){if(live){setStatus("error");setError(e.message);}}
  })();
  return()=>{live=false};
 },[]);
 const rows=useMemo(()=>combinedInvoiceRows(nativeInvoices,external,today),
  [nativeInvoices,external,today]);
 const totals=rows.reduce((s,x)=>({
  count:s.count+1,total:s.total+x.total,paid:s.paid+x.paid,
  outstanding:s.outstanding+x.outstanding
 }),{count:0,total:0,paid:0,outstanding:0});
 const visible=rows.filter(x=>{
  if(filter==="unpaid"&&x.outstanding===0)return false;
  if(filter==="paid"&&x.outstanding>0)return false;
  if(filter==="overdue"&&!(x.outstanding>0&&x.due&&x.due<today))return false;
  const q=query.trim().toLocaleLowerCase("nb-NO");
  return !q||[x.customer,x.number,x.source].join(" ").toLocaleLowerCase("nb-NO").includes(q);
 }).sort((a,b)=>(a.outstanding===0)-(b.outstanding===0)||
  (a.outstanding>0&&b.outstanding>0?String(a.due||"9999").localeCompare(String(b.due||"9999")):0)||
  String(b.date).localeCompare(String(a.date))||a.key.localeCompare(b.key));
 return <section style={{border:"1px solid #d7c7ad",borderRadius:12,
  background:"#fffdfa",padding:"clamp(12px,2vw,20px)",margin:"20px 0"}}>
  <div style={{display:"flex",gap:12,justifyContent:"space-between",alignItems:"center",
   flexWrap:"wrap"}}>
   <div><h2 style={{margin:"0 0 5px",fontSize:21}}>Samlet fakturaoversikt</h2>
    <p style={{fontSize:13,margin:0,color:"#635b4f"}}>
     Fakturaer fra Aadland Service og fakturaer du har lastet opp fra andre systemer.</p>
   </div>
   <button type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
    {open?"Skjul samlet oversikt":"Vis samlet oversikt"}
   </button>
  </div>
  {open&&<>
   {status==="loading"&&<p role="status">Laster eksterne fakturaer …</p>}
   {status==="error"&&<p role="alert" style={{color:"#9d392a"}}>
    Eksterne fakturaer kunne ikke lastes: {error}. Summene nedenfor gjelder
    bare fakturaer utstedt i Aadland Service.</p>}
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",
    gap:10,margin:"16px 0"}}>
    {[
     ["Antall fakturaer",String(totals.count)],
     ["Totalt fakturert",kr(totals.total)],
     ["Registrert betalt",kr(totals.paid)],
     ["Utestående",kr(totals.outstanding)]
    ].map(([label,value])=><div key={label} style={{border:"1px solid #e3dcd1",
     borderRadius:9,padding:10,minWidth:0}}>
     <small style={{display:"block",color:"#665d53"}}>{label}</small>
     <strong style={{overflowWrap:"anywhere"}}>{value}</strong>
    </div>)}
   </div>
   <p style={{fontSize:12,color:"#655a4d"}}>
    Dette er en samlet intern betalingsoversikt, ikke en bokført omsetningsrapport.
    Betalte beløp for eksterne fakturaer følger manuell registrering.
    Ingen faktura telles to ganger dersom den bare finnes i sitt eget register.
   </p>
   <div style={{display:"flex",flexWrap:"wrap",gap:9,alignItems:"end"}}>
    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
     {[["unpaid","Ubetalte"],["overdue","Forfalte"],["paid","Betalte"],["all","Alle"]]
      .map(([key,title])=><button type="button" key={key}
       aria-pressed={filter===key} onClick={()=>setFilter(key)}
       style={{padding:"8px 10px",borderRadius:8,border:"1px solid #cbbfaa",
        background:filter===key?"#e9d7b8":"#fff"}}>{title}</button>)}
    </div>
    <label style={{fontSize:13,display:"grid",gap:4,flex:"1 1 170px"}}>
     Søk kunde, nummer eller system
     <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
      placeholder="Søk i alle fakturaer" style={{width:"100%"}}/>
    </label>
   </div>
   <div style={{marginTop:14,display:"grid",gap:7}}>
    {visible.length===0&&<p>Ingen fakturaer passer søket.</p>}
    {visible.map(x=><Link key={x.key} href={x.href}
     style={{display:"flex",flexWrap:"wrap",gap:12,justifyContent:"space-between",
      padding:12,borderRadius:9,border:"1px solid #e3ddd5",background:"#fff",
      textDecoration:"none",color:"inherit"}}>
     <span style={{flex:"1 1 220px",minWidth:0}}>
      <strong>{x.number}</strong> · {x.customer}
      <small style={{display:"block",color:"#635b52"}}>
       {x.source} · Fakturadato {x.date||"ukjent"} · Forfall {x.due||"ukjent"}
      </small>
     </span>
     <span style={{textAlign:"right"}}>
      <strong>{kr(x.total)}</strong>
      <small style={{display:"block",color:x.outstanding?"#985034":"#287049"}}>
       {x.label}{x.outstanding>0?" · Gjenstår "+kr(x.outstanding):""}
      </small>
     </span>
    </Link>)}
   </div>
   <p style={{fontSize:13,marginTop:15}}>
    <Link href="/admin/faktura/eksterne">Last opp ekstern faktura eller registrer betaling</Link>
   </p>
  </>}
 </section>;
}
