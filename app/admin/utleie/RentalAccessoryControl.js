"use client";
import {rentalAccessoryBaseline,RENTAL_ACCESSORY_MAX} from "../../../lib/rentalAccessories.mjs";
import styles from "./rentalAccessories.module.css";
const suggestions=["Batteri","Lader","Koffert","Slange","Strømkabel","Adapter","Bor","Sagblad"];
export function initialAccessoryInput(booking,next){
 const base=rentalAccessoryBaseline(booking.customer);
 return {rows:next==="returned"&&base?base.map(x=>({name:x.name,returned:null,damaged:null})):[],noAccessories:false,legacyReviewed:false,confirmed:false};
}
export function RentalAccessoryFields({booking,next,value,onChange,busy}){
 const outgoing=next==="active",base=rentalAccessoryBaseline(booking.customer);
 const update=changes=>onChange({...value,...changes,confirmed:false});
 const edit=(i,field,v)=>update({rows:value.rows.map((x,j)=>j===i?{...x,[field]:v}:x)});
 const number=e=>e.target.value===""?null:Number(e.target.value);
 return <div className={styles.panel}><h4>Tilbehør – {outgoing?"utlevering":"retur"}</h4>
 {outgoing?<><p>Registrer faktisk antall som følger med denne bookingen. Ingen standardantall fylles inn.</p>
 <div className={styles.chips}>{suggestions.map(name=><button key={name} type="button" className="btn alt" disabled={busy||value.noAccessories||value.rows.length>=RENTAL_ACCESSORY_MAX||value.rows.some(x=>x.name.trim().toLocaleLowerCase("nb-NO")===name.toLocaleLowerCase("nb-NO"))} onClick={()=>update({rows:[...value.rows,{name,quantity:null}]})}>+ {name}</button>)}</div>
 {value.rows.map((row,i)=><div className={styles.line} key={i}><label>Tilbehør<input value={row.name} maxLength={80} onChange={e=>edit(i,"name",e.target.value)} disabled={busy}/></label><label>Utlevert antall<input type="number" min={1} max={100} step={1} value={row.quantity??""} onChange={e=>edit(i,"quantity",number(e))} disabled={busy}/></label><button type="button" className="btn alt" disabled={busy} onClick={()=>update({rows:value.rows.filter((_,j)=>j!==i)})}>Fjern</button></div>)}
 <button type="button" className="btn alt" disabled={busy||value.noAccessories||value.rows.length>=RENTAL_ACCESSORY_MAX} onClick={()=>update({rows:[...value.rows,{name:"",quantity:null}]})}>+ Annet tilbehør</button>
 <label className={styles.check}><input type="checkbox" checked={value.noAccessories} disabled={busy||value.rows.length>0} onChange={e=>update({noAccessories:e.target.checked})}/> Ingen løse tilbehørsdeler følger med</label></>:base?<>
 {base.length===0?<p>Ingen løse tilbehørsdeler ble registrert ved utlevering.</p>:base.map((row,i)=><div className={styles.line} key={row.name}><div><b>{row.name}</b><p>Utlevert: {row.quantity}</p></div><label>Returnert (inkl. skadet)<input type="number" min={0} max={row.quantity} step={1} value={value.rows[i]?.returned??""} onChange={e=>edit(i,"returned",number(e))} disabled={busy}/></label><label>Av disse skadet<input type="number" min={0} max={value.rows[i]?.returned??0} step={1} value={value.rows[i]?.damaged??""} onChange={e=>edit(i,"damaged",number(e))} disabled={busy}/></label><p>{Number.isInteger(value.rows[i]?.returned)?"Mangler: "+Math.max(0,row.quantity-value.rows[i].returned):"Mangler: ikke kontrollert"}</p></div>)}</>:<>
 <p className="notice">Utleveringslisten mangler. Ikke anta at alle deler er returnert. Bruk tilgjengelig dokumentasjon.</p><label className={styles.check}><input type="checkbox" checked={value.legacyReviewed} onChange={e=>update({legacyReviewed:e.target.checked})} disabled={busy}/> Jeg har kontrollert tilgjengelig dokumentasjon og beskriver grunnlaget i kontrollmerknaden.</label></>}
 <label className={styles.check}><input type="checkbox" checked={value.confirmed} onChange={e=>onChange({...value,confirmed:e.target.checked})} disabled={busy}/> Jeg har kontrollert tilbehøret fysisk.</label><p>Registreringen gir ikke automatisk trekk i depositum eller faktura.</p></div>;
}
export function RentalAccessorySummary({booking}){
 const base=rentalAccessoryBaseline(booking.customer),ret=booking.customer?.accessoryReturn;
 if(!base&&!ret)return null;
 return <section className={styles.panel}><h4>Registrert tilbehør</h4>{base?<>{base.length===0?<p>Ingen løse deler ved utlevering.</p>:base.map(x=>{const y=Array.isArray(ret?.rows)?ret.rows.find(r=>r.name===x.name):null;return <p key={x.name}><b>{x.name}</b> · Utlevert {x.quantity}{y?" · Returnert "+y.returned+" · Mangler "+y.missing+" · Skadet "+y.damaged:" · Retur ikke registrert"}</p>;})}</>:<p>Retur kontrollert manuelt uten opprinnelig tilbehørsliste. Se kontrollmerknaden.</p>}</section>;
}
