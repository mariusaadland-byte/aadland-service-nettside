export const RENTAL_DELIVERY_POLICY=Object.freeze({version:"2026-11-27",kmRate:"12.50",minPrice:"150",maxPrice:"750",maxDistance:"30",allowedPostcodes:""});
function decimal(value,digits,max){
 if(typeof value!=="string"||!/^\d{1,8}([.,]\d{1,2})?$/.test(value.trim()))return null;
 const n=Number(value.trim().replace(",","."));
 if(!Number.isFinite(n)||n<0||n>max)return null;
 return Math.round(n*10**digits);
}
export function rentalDeliveryQuote(v,policy=RENTAL_DELIVERY_POLICY){
 if(!v||!["delivery","collection","both"].includes(v.service))return null;
 const distance=decimal(v.distance,2,1000),max=decimal(policy.maxDistance,2,1000),rate=decimal(policy.kmRate,2,100000),minimum=decimal(policy.minPrice,2,1000000),maximum=decimal(policy.maxPrice,2,1000000),rent=decimal(v.rent,2,10000000),deposit=decimal(v.deposit,2,10000000);
 if([distance,max,rate,minimum,maximum,rent,deposit].some(x=>x===null)||max<=0||rate<=0||minimum>maximum)return null;
 if(typeof v.postcode!=="string"||!/^\d{4}$/.test(v.postcode.trim())||typeof policy.allowedPostcodes!=="string")return null;
 const codes=policy.allowedPostcodes.trim()?policy.allowedPostcodes.trim().split(/[\s,;]+/):[];
 if(codes.some(x=>!/^\d{4}$/.test(x))||codes.length>500)return null;
 if(distance>max)return {eligible:false,reason:"Avstanden overstiger leveringsgrensen. Gi et eget pristilbud."};
 if(codes.length&&!codes.includes(v.postcode.trim()))return {eligible:false,reason:"Postnummeret er utenfor leveringsområdet. Gi et eget pristilbud."};
 const delivery=v.service!=="collection",collection=v.service!=="delivery",trips=Number(delivery)+Number(collection);
 const deliveryTolls=delivery?decimal(v.deliveryTolls,2,1000000):0,collectionTolls=collection?decimal(v.collectionTolls,2,1000000):0;
 if(deliveryTolls===null||collectionTolls===null)return null;
 const travelOre=Math.round(distance*2*rate/100),standardPerTripOre=Math.min(maximum,Math.max(minimum,travelOre));
 const override=v.override===true;
 const chosen=override?decimal(v.overridePrice,2,1000000):standardPerTripOre;
 const reason=typeof v.overrideReason==="string"?v.overrideReason.trim():"";
 if(chosen===null||override&&(reason.length<5||reason.length>300))return null;
 const deliveryOre=delivery?chosen+deliveryTolls:0,collectionOre=collection?chosen+collectionTolls:0;
 const transportOre=deliveryOre+collectionOre;
 if(!Number.isSafeInteger(transportOre)||transportOre+rent>2147483647)return null;
 return {eligible:true,policyVersion:policy.version,trips,drivingKm:distance*2*trips/100,travelOre,standardPerTripOre,perTripOre:chosen,deliveryOre,collectionOre,tollsOre:deliveryTolls+collectionTolls,transportOre,rentOre:rent,depositOre:deposit,totalOre:rent+transportOre,override,overrideReason:override?reason:""};
}
