const blank=v=>v==null||v==="";
export function rentalProductPricingError(b){
 const money=v=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0&&v<=100000000;
 if(!money(b.dailyPriceOre)||b.dailyPriceOre<=0)return "Døgnprisen må være et gyldig beløp høyere enn 0 kr.";
 for(const [label,value] of [["Helgepris",b.weekendPriceOre],["Ukepris",b.weeklyPriceOre]]){
  if(!blank(value)&&(!money(value)||value<=0))return label+" må være høyere enn 0 kr, eller stå tom.";
 }
 if(!blank(b.depositOre)&&!money(b.depositOre))return "Depositum må være et gyldig beløp fra 0 kr.";
 const discount=Number(b.longTermDiscountPercent||0);
 if(discount>0&&blank(b.longTermDays))return "Angi antall dager for langtidsrabatten.";
 if(b.active!==false&&b.status==="available"&&b.pickupAvailable===false&&!b.deliveryAvailable)return "Publisert utstyr som kan bookes, må ha henting eller levering.";
 return null;
}
export function rentalProductWarnings(b){
 const warnings=[];
 if(!String(b.description||"").trim())warnings.push("Legg til beskrivelse av bruksområde, hva som følger med og eventuelle begrensninger.");
 if(!Array.isArray(b.imageUrls)||!b.imageUrls.length)warnings.push("Legg til minst ett tydelig produktbilde.");
 const daily=Number(b.dailyPriceOre);
 if(daily>0&&!blank(b.weeklyPriceOre)&&Number(b.weeklyPriceOre)>daily*7)warnings.push("Ukeprisen er høyere enn syv døgnpriser. Kontroller at dette er tilsiktet.");
 if(Number(b.longTermDiscountPercent)===100)warnings.push("100 % langtidsrabatt kan gjøre leien gratis. Kontroller at dette er tilsiktet.");
 return warnings;
}
