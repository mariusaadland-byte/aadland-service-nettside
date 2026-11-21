// Read-only advisory based on successful import time; NOT live supplier pricing.
export const SUPPLIER_PRICE_REVIEW_AFTER_DAYS=30;

export function supplierPriceFreshness({id,lastImportAt,productCount}={},now=Date.now()){
 if(id==="egne-varer")return {priceStatus:"manual",priceReviewRequired:false,priceAgeDays:null};
 if(productCount===0||!lastImportAt)return {priceStatus:"missing",priceReviewRequired:false,priceAgeDays:null};
 const imported=Date.parse(String(lastImportAt));
 if(!Number.isFinite(imported))return {priceStatus:"unknown",priceReviewRequired:true,priceAgeDays:null};
 const reference=now instanceof Date?now.getTime():Number(now);
 const ageDays=Math.max(0,Math.floor((reference-imported)/86400000));
 const needsReview=ageDays>=SUPPLIER_PRICE_REVIEW_AFTER_DAYS;
 return {priceStatus:needsReview?"needs-review":"imported",priceReviewRequired:needsReview,priceAgeDays:ageDays};
}

export function supplierPriceNotice(supplier){
 if(!supplier)return "";
 const name=supplier.name||"leverandøren";
 if(supplier.priceStatus==="manual")return "Egne varer er registrert manuelt. Kontroller innkjøpspris og salgspris før bruk.";
 if(supplier.priceStatus==="missing")return "Ingen importert prisliste for "+name+". Legg inn en prisfil før du forventer varetreff.";
 if(supplier.priceStatus==="unknown")return "Importdatoen for "+name+" kan ikke leses. Kontroller innkjøpsprisen før tilbud.";
 const dateRaw=Date.parse(String(supplier.lastImportAt||""));
 const date=Number.isFinite(dateRaw)?new Date(dateRaw).toLocaleDateString("nb-NO"):"ukjent dato";
 return "Prislisten fra "+name+" ble sist importert "+date+"."+
  (supplier.priceReviewRequired?" Den er minst 30 dager gammel – bekreft dagens innkjøpspris før du sender tilbud.":" Kontroller alltid at prisen stemmer med leverandøravtalen.");
}
