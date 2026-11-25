export const rentalUnitId=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function rentalUnitUrl(id){return rentalUnitId(id)?"https://www.aadlandutleie.no/admin/utleie/enheter/"+id.toLowerCase():null;}
export function rentalUnitLabel(id){return rentalUnitId(id)?"AU-"+id.toUpperCase():null;}
export function rentalUnitInput(body){
 if(!rentalUnitId(body?.itemId)||!rentalUnitId(body?.requestId)||typeof body?.serialNumber!=="string"||body.serialNumber.trim().length>100||/[\r\n\x00-\x1f]/.test(body.serialNumber))return null;
 return {id:body.requestId.toLowerCase(),rental_item_id:body.itemId.toLowerCase(),serial_number:body.serialNumber.trim()||null};
}
