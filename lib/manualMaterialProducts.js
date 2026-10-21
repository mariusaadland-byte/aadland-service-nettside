export const MANUAL_SUPPLIER_ID="egne-varer";
export function parseManualProduct(body){
 const clean=(v,max)=>String(v??"").trim().slice(0,max);
 const amount=value=>{
  if(value==null||String(value).trim()==="")return null;
  const normalized=String(value).trim().replace(/\s/g,"").replace(",",".");
  if(!/^\d+(?:\.\d{1,2})?$/.test(normalized))return null;
  const n=Number(normalized),ore=Math.round(n*100);
  return Number.isFinite(n)&&ore>=0&&ore<=100000000?ore:null;
 };
 const name=clean(body.name,300),unit=clean(body.unit,30),cost=amount(body.costExVat),sale=amount(body.saleExVat);
 if(!name||!unit)return {error:"Fyll inn varenavn og enhet."};
 if(cost===null||sale===null)return {error:"Oppgi gyldige priser eks. MVA med maksimalt to desimaler (0–1 000 000 kr)."};
 return {record:{name,unit,cost_ex_vat_ore:cost,sale_ex_vat_ore:sale,category_name:clean(body.supplierName,240),ean:clean(body.ean,120)}};
}
