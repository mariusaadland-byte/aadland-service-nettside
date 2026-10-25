// Document-date routing, independent of the current clock or selected VAT term.
export function vatDocumentPeriod(date){
 if(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 const parsed=new Date(date+"T12:00:00Z");
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)return null;
 const year=Number(date.slice(0,4)),month=Number(date.slice(5,7)),term=Math.ceil(month/2);
 if(year<2000||year>2100||term<1||term>6)return null;
 const names=["januar–februar","mars–april","mai–juni","juli–august","september–oktober","november–desember"];
 return {year,term,title:term+". termin "+year,months:names[term-1],key:year+"-"+term};
}
