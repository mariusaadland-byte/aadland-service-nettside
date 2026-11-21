// Shared, browser-safe calculator -> quote transformation.
// Quote lines and the offer PDF use prices EXCLUSIVE of 25% VAT.
export const CATALOG_QUOTE_TRANSFER_KEY="aadlandQuoteMaterialsTransferV1";
const val=value=>{const n=Number(String(value??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)&&n>=0?n:0};
const ore=value=>Math.round(value*100);
// A single list for the calculator screen AND the quote-transfer flow.
// All amounts are estimate inputs (NOK per assumed passage), not live quotes.
// Rate tables verified 2026-11-21 against Ferde; toll direction/timesregler
// and actual route must still be checked before customer quote.
export const CALCULATOR_TOLL_PRESETS=Object.freeze([
 {id:"none",label:"Ingen bompenger (velg hvis aktuelt)",amount:0,note:"Ingen bom lagt til automatisk. Velg en rute eller egendefinert beløp ved behov."},
 {id:"bergen-bjornafjorden-ordinary",label:"Bergen ↔ Bjørnafjorden · bensin/hybrid med AutoPASS",amount:76.80,note:"Forenklet: 25,60 Bergen + 51,20 E39. Bergen krever inn i én retning; kontroller faktisk rute/passeringer."},
 {id:"bergen-bjornafjorden-rush",label:"Bergen ↔ Bjørnafjorden · bensin/hybrid AutoPASS i rush",amount:102.40,note:"Forenklet: 51,20 Bergen + 51,20 E39. Bergen krever inn i én retning; kontroller rushtid og faktiske passeringer."},
 {id:"bergen-bjornafjorden-ev",label:"Bergen ↔ Bjørnafjorden · elbil med AutoPASS",amount:53.44,note:"Forenklet: 17,60 Bergen + 35,84 E39. Bergen krever inn i én retning; kontroller faktisk rute."},
 {id:"e39-ordinary",label:"Kun E39 Rådal–Svegatjørn · ordinær AutoPASS",amount:51.20,note:"Takstgruppe 1, ordinært kjøretøy; E39 krever inn i begge retninger."},
 {id:"e39-ev",label:"Kun E39 Rådal–Svegatjørn · elbil AutoPASS",amount:35.84,note:"Takstgruppe 1, nullutslipp; E39 krever inn i begge retninger."},
 {id:"bergen-ordinary",label:"Kun Bergen bomring · bensin/hybrid AutoPASS",amount:25.60,note:"Uten rush; Bergen krever inn i én retning og har timesregel."},
 {id:"bergen-ordinary-rush",label:"Kun Bergen bomring · bensin/hybrid AutoPASS i rush",amount:51.20,note:"I rushtiden; Bergen krever inn i én retning og har timesregel."},
 {id:"bergen-ev",label:"Kun Bergen bomring · elbil AutoPASS",amount:17.60,note:"Uten rush; Bergen krever inn i én retning og har timesregel."},
 {id:"custom",label:"Egendefinert bom per enkeltvei",amount:null,note:"Skriv inn beløpet du vil fakturere for hvert av de valgte enkeltvei-anslagene."}
]);

export function calculatorTollEstimate(form){
 const trips=Math.max(0,Math.round(val(form?.oneWayTrips)));
 const preset=CALCULATOR_TOLL_PRESETS.find(row=>row.id===form?.tollPreset)||CALCULATOR_TOLL_PRESETS[0];
 const tollPerWay=preset.id==="custom"?val(form?.customToll):val(preset.amount);
 return {preset,trips,tollPerWay,toll:tollPerWay*trips};
}

export function unitSaleExVat(item,markup){
 const override=String(item.saleExVat??"").trim();
 return override!==""?val(override):val(item.costExVat)*(1+val(markup)/100);
}
export function quoteLinesFromCalculator(form,{includeExtras=false}={}){
 const markup=val(form?.materialMarkup),items=Array.isArray(form?.materialItems)?form.materialItems:[];
 const lines=[];
 for(const item of items){
  const quantity=val(item.qty),price=unitSaleExVat(item,markup);
  const name=String(item.name||"").trim();
  if(!name||quantity<=0)continue;
  lines.push({
   type:"material",description:[name,item.sku?"Varenr. "+String(item.sku).trim():""].filter(Boolean).join(" · ").slice(0,500),
   quantity,unit:String(item.unit||"stk").trim().slice(0,40)||"stk",
   unitPriceOre:ore(price),vatRate:25,
   internalUnitCostOre:String(item.costExVat??"").trim()===""?"":ore(val(item.costExVat))
  });
 }
 if(includeExtras){
  const workHours=val(form?.hours),rate=val(form?.hourlyRate),fixed=val(form?.fixedLabor);
  if(fixed>0)lines.push({type:"work",description:"Arbeid – fastpris",quantity:1,unit:"jobb",unitPriceOre:ore(fixed/1.25),vatRate:25});
  else if(workHours>0&&rate>0)lines.push({type:"work",description:"Arbeid",quantity:workHours,unit:"time",unitPriceOre:ore(rate/1.25),vatRate:25});
  const customMaterial=val(form?.materialCost);
  if(customMaterial>0)lines.push({type:"material",description:"Andre materialer",quantity:1,unit:"stk",unitPriceOre:ore(customMaterial*(1+markup/100)/1.25),vatRate:25,internalUnitCostOre:ore(customMaterial/1.25)});
  const {trips,toll}=calculatorTollEstimate(form);
  const distance=val(form?.distanceOneWay);
  const km=trips*distance*val(form?.kmRate);
  if(km>0)lines.push({type:"other",description:"Kjøring – "+(trips*distance).toLocaleString("nb-NO")+" km",quantity:1,unit:"stk",unitPriceOre:ore(km/1.25),vatRate:25});
  // Toll is an explicit, independent estimate: a customer visit may have a toll
  // even when km has not yet been registered. Mirror the calculator exactly.
  if(toll>0)lines.push({type:"other",description:"Bompasseringer – "+trips+" vei(er)",quantity:1,unit:"stk",unitPriceOre:ore(toll/1.25),vatRate:25});
 }
 return lines.slice(0,120);
}
