import "server-only";
import {db,fromDbRentalItem} from "./supabase";
import {calculateRentalPrice} from "./rentalPricing.mjs";
import {consumableQuote} from "./rentalConsumables.mjs";
import {rentalUnitId} from "./rentalUnitQr.mjs";
import {checkoutAgreement} from "./rentalCheckoutAgreement.mjs";
import {signingArchiveEnabled} from "./signingArchiveConfig";
import {osloDateKey} from "./osloTime";
// All existing flags plus dedicated group flag; no activation in this branch.
export const groupCheckoutEnabled=()=>signingArchiveEnabled()&&process.env.RENTAL_PUBLIC_BOOKING_ENABLED==="true"&&process.env.RENTAL_CART_ENABLED==="true"&&process.env.AADLAND_GROUP_CHECKOUT_ENABLED==="true";
function requireResult(result){if(result.error)throw Error("CHECKOUT_STORE_UNCONFIRMED");return result.data;}
export async function reserveCheckoutAgreement(customerId,body){
 if(!groupCheckoutEnabled()||!rentalUnitId(customerId))return {status:"unavailable"};
 const s=db();if(!s)return {status:"unavailable"};
 const [auth,profile]=await Promise.all([s.auth.admin.getUserById(customerId),s.from("customer_profiles").select("name").eq("id",customerId).maybeSingle()]);
 if(auth.error||profile.error||auth.data?.user?.id!==customerId)return {status:"unavailable"};
 const store={
  find:async(c,r)=>requireResult(await s.from("rental_order_groups").select("*").eq("customer_user_id",c).eq("request_id",r).maybeSingle()),
  reserve:async(c,p)=>requireResult(await s.rpc("draft_group_reserve",{p_customer:c,p_request:p.requestId,p_digest:p.quoteDigest,p_snapshot:p.snapshot})),
  current:async(g,c)=>{
   const p=requireResult(await s.from("aadland_agreement_current").select("agreement_id").eq("group_id",g).maybeSingle());
   return p?requireResult(await s.from("aadland_agreements").select("*").eq("id",p.agreement_id).eq("group_id",g).eq("customer_user_id",c).maybeSingle()):null;
  },
  attach:async({group,customerId,email,agreementId,pdf})=>requireResult(await s.rpc("draft_group_attach_agreement",{p_group:group.id,p_customer:customerId,p_email:email,p_id:agreementId,p_bytes:"\\x"+pdf.bytes.toString("hex"),p_document:pdf.documentDigest,p_quote:pdf.quoteDigest,p_terms:pdf.termsVersion}))
 };
 async function price(input){
  const products=requireResult(await s.from("rental_items").select("*").in("id",input.rentals.map(x=>x.itemId)));
  if(!Array.isArray(products))return null;
  const rentals=input.rentals.map(line=>{
   const row=products.find(p=>p.id===line.itemId);
   if(!row||row.active!==true||row.status!=="available"||row.pickup_available!==true)return null;
   const item=fromDbRentalItem(row),p=calculateRentalPrice(item,line.startDate,line.endDate);
   return p?{...line,name:item.name,available:true,totalOre:p.totalOre*line.quantity,depositOre:p.depositOre*line.quantity}:null;
  });
  if(rentals.some(x=>!x))return null;
  if(!input.goods.length)return {rentals,goods:[]};
  if(process.env.RENTAL_CONSUMABLES_ENABLED!=="true")return null;
  const goods=requireResult(await s.from("rental_consumables").select("id,name,sku,rental_item_id,active,price_ore,stock_quantity,reserved_quantity").in("id",input.goods.map(x=>x.id)));
  if(!Array.isArray(goods)||goods.some(g=>!Number.isSafeInteger(g.reserved_quantity)||g.reserved_quantity<0||g.reserved_quantity>g.stock_quantity))return null;
  const q=consumableQuote(input.goods,goods.map(g=>({...g,stock_quantity:g.stock_quantity-g.reserved_quantity})),input.rentals.map(x=>x.itemId));
  if(q?.salesOre===null||!q)return null;
  return {rentals,goods:q.lines.map(x=>({...x,sku:goods.find(g=>g.id===x.id)?.sku}))};
 }
 // SQL reserve rechecks prices, blocked periods and capacity under locks.
 const date=new Date();
 return checkoutAgreement({body,account:auth.data.user,customerName:profile.data?.name,today:osloDateKey(date),now:date.toISOString(),store,price});
}
