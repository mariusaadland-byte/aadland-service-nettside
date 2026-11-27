import {rentalUnitId,rentalUnitUrl,rentalUnitLabel} from './rentalUnitQr.mjs';
export function scanRentalUnit(value){
 if(typeof value!=="string")return null;
 const v=value.trim(),id=rentalUnitId(v)?v:/^AU-/i.test(v)?v.slice(3):v.startsWith("https://www.aadlandutleie.no/admin/utleie/enheter/")?v.split("/").pop():null;
 if(!rentalUnitId(id))return null;
 const canonical=id.toLowerCase();
 return [canonical,rentalUnitUrl(canonical),rentalUnitLabel(canonical)].some(x=>x.toLowerCase()===v.toLowerCase())?canonical:null;
}
