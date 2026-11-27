const count=v=>Number.isInteger(v)&&v>=0&&v<=100;
export const RENTAL_ACCESSORY_MAX=20;
function baselineRows(rows){
 if(!Array.isArray(rows)||rows.length>RENTAL_ACCESSORY_MAX)return null;
 const seen=new Set(),out=[];
 for(const row of rows){
  const name=typeof row?.name==="string"?row.name.trim():"";
  const key=name.toLocaleLowerCase("nb-NO");
  if(!name||name.length>80||/[\x00-\x1f]/.test(name)||seen.has(key)||!count(row.quantity)||row.quantity<1)return null;
  seen.add(key);out.push({name,quantity:row.quantity});
 }
 return out;
}
export function rentalAccessoryBaseline(customer){
 const x=customer?.accessoryHandover;
 if(!x)return null;
 const rows=baselineRows(x.rows);
 if(x.version!==1||!rows||typeof x.recordedAt!=="string")return null;
 return rows;
}
export function rentalAccessoryRecord(booking,next,input,at){
 if(!input||input.confirmed!==true)return {error:"Bekreft tilbehørskontrollen før du fortsetter."};
 const customer=booking.customer||{};
 if(next==="active"){
  if(customer.accessoryHandover||customer.accessoryReturn)return {error:"Tilbehør er allerede registrert. Oppdater bookingen."};
  const rows=baselineRows(input.rows);
  if(!rows||(!rows.length&&input.noAccessories!==true)||(rows.length&&input.noAccessories===true))return {error:"Registrer navn og antall, eller bekreft at det ikke følger med tilbehør."};
  return {customer:{...customer,accessoryHandover:{version:1,rows,recordedAt:at}},deviation:false};
 }
 if(next!=="returned")return {error:"Ugyldig tilbehørskontroll."};
 if(customer.accessoryReturn)return {error:"Returkontroll er allerede registrert."};
 const baseline=rentalAccessoryBaseline(customer);
 if(!baseline){
  if(customer.accessoryHandover)return {error:"Utleveringslisten kan ikke leses. Avklar dokumentasjonen før retur."};
  if(input.legacyReviewed!==true)return {error:"Eldre booking mangler utleveringsliste. Bekreft manuell kontroll og beskriv grunnlaget."};
  return {customer:{...customer,accessoryReturn:{version:1,legacy:true,recordedAt:at}},deviation:true};
 }
 if(!Array.isArray(input.rows)||input.rows.length!==baseline.length)return {error:"Kontroller alle registrerte tilbehørslinjer."};
 const rows=[];
 for(let i=0;i<baseline.length;i++){
  const x=input.rows[i],b=baseline[i];
  if(x?.name!==b.name||!count(x.returned)||!count(x.damaged)||x.returned>b.quantity||x.damaged>x.returned)return {error:"Kontroller returnert og skadet antall for "+b.name+"."};
  rows.push({...b,returned:x.returned,damaged:x.damaged,missing:b.quantity-x.returned});
 }
 return {customer:{...customer,accessoryReturn:{version:1,rows,recordedAt:at}},deviation:rows.some(x=>x.missing>0||x.damaged>0)};
}
