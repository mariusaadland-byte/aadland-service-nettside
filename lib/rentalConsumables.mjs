import {rentalUnitId} from "./rentalUnitQr.mjs";
export const MAX_CONSUMABLE_LINES=20;
const max=2147483647;
export function consumableInput(input){
 if(input===undefined)return [];
 if(!Array.isArray(input)||input.length>MAX_CONSUMABLE_LINES)return null;
 const seen=new Set(),out=[];
 for(const x of input){
  if(!rentalUnitId(x?.id)||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>100)return null;
  const id=x.id.toLowerCase();if(seen.has(id))return null;
  seen.add(id);out.push({id,quantity:x.quantity});
 }
 return out;
}
export function consumableQuote(input,products,rentalIds){
 const lines=consumableInput(input);
 if(!lines||!Array.isArray(products)||!Array.isArray(rentalIds))return null;
 const allowed=new Set(rentalIds),byId=new Map(products.map(p=>[p.id,p]));
 let salesOre=0;
 const result=lines.map(x=>{
  const p=byId.get(x.id);
  const fail=()=>({...x,name:"Utilgjengelig forbruksmateriell",available:false});
  if(!p||p.active!==true||!allowed.has(p.rental_item_id)||!Number.isSafeInteger(p.stock_quantity)||p.stock_quantity<x.quantity||!Number.isSafeInteger(p.price_ore)||p.price_ore<1)return fail();
  const totalOre=p.price_ore*x.quantity;
  if(!Number.isSafeInteger(totalOre)||totalOre>max)return fail();
  salesOre+=totalOre;
  return {...x,name:p.name,available:true,unitOre:p.price_ore,totalOre};
 });
 return {lines:result,salesOre:result.every(x=>x.available)&&Number.isSafeInteger(salesOre)&&salesOre<=max?salesOre:null};
}
export function mixedQuoteTotals(rental,sales){
 if(!rental||!Number.isSafeInteger(sales?.salesOre)||sales.salesOre<0)return null;
 const payableOre=rental.rentalOre+sales.salesOre;
 if(!Number.isSafeInteger(payableOre)||payableOre>max||payableOre+rental.depositOre>max)return null;
 return {...rental,salesOre:sales.salesOre,payableOre};
}
