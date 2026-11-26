"use client";
import {rentalWindowChoices} from "../../lib/rentalPickupWindows.mjs";
export default function PickupWindows({config,start,end,pickup,returning,onPickup,onReturn,disabled}){
 const a=rentalWindowChoices(config.pickup,start),b=rentalWindowChoices(config.return,end).filter(x=>start!==end||!pickup||pickup.slice(6)<=x.slice(0,5));
 return <fieldset style={{minWidth:0,border:"1px solid #839398",borderRadius:10,padding:12,margin:"12px 0"}}><legend>Ønsket tidspunkt</legend>
 <label><span>Henting ({start||"velg dato"})</span><select value={pickup} required disabled={disabled||!a.length} onChange={e=>{onPickup(e.target.value);onReturn("");}}><option value="">Velg tidsvindu</option>{a.map(x=><option key={x} value={x}>{x.replace("-","–")}</option>)}</select></label>
 <label><span>Tilbakelevering ({end||"velg dato"})</span><select value={returning} required disabled={disabled||!b.length} onChange={e=>onReturn(e.target.value)}><option value="">Velg tidsvindu</option>{b.map(x=><option key={x} value={x}>{x.replace("-","–")}</option>)}</select></label>
 {(!a.length||!b.length)&&<p role="status">Ingen valgbare tidsvinduer for valgte datoer. Velg annen dato eller kontakt oss.</p>}
 <p>Ønskede tidsvinduer i norsk lokal tid. Henting og retur må avtales med oss. Døgnpris og kalenderreservasjon endres ikke.</p></fieldset>;
}
