// Shared, browser-safe calculator -> quote transformation.
// Quote lines and the offer PDF use prices EXCLUSIVE of 25% VAT.
export const CATALOG_QUOTE_TRANSFER_KEY="aadlandQuoteMaterialsTransferV1";
const val=value=>{const n=Number(String(value??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)&&n>=0?n:0};
const ore=value=>Math.round(value*100);
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
  const trips=Math.round(val(form?.oneWayTrips)),distance=val(form?.distanceOneWay);
  const km=trips*distance*val(form?.kmRate);
  if(km>0)lines.push({type:"other",description:"Kjøring – "+(trips*distance).toLocaleString("nb-NO")+" km",quantity:1,unit:"stk",unitPriceOre:ore(km/1.25),vatRate:25});
  const tolls={"bergen-bjornafjorden-ordinary":76.8,"bergen-bjornafjorden-rush":102.4,"bergen-bjornafjorden-ev":53.44,"e39-ordinary":51.2,"e39-ev":35.84,"bergen-ordinary":25.6,"bergen-ordinary-rush":51.2,"bergen-ev":17.6};
  const toll=trips*val(form?.tollPreset==="custom"?form?.customToll:(tolls[form?.tollPreset]??0));
  if(toll>0&&distance>0)lines.push({type:"other",description:"Bompasseringer – "+trips+" vei(er)",quantity:1,unit:"stk",unitPriceOre:ore(toll/1.25),vatRate:25});
 }
 return lines.slice(0,120);
}
