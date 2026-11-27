function decimal(value,digits,max){
 if(typeof value!=="string"||!/^\d{1,8}([.,]\d{1,2})?$/.test(value.trim()))return null;
 const n=Number(value.trim().replace(",","."));
 if(!Number.isFinite(n)||n<0||n>max)return null;
 return Math.round(n*10**digits);
}
export function rentalDeliveryQuote(v){
 if(!v||!["delivery","collection","both"].includes(v.service))return null;
 const distance=decimal(v.distance,2,1000),max=decimal(v.maxDistance,2,1000),rate=decimal(v.kmRate,2,100000),base=decimal(v.base,2,1000000),extras=decimal(v.extras,2,1000000),rent=decimal(v.rent,2,10000000),deposit=decimal(v.deposit,2,10000000);
 if([distance,max,rate,base,extras,rent,deposit].some(x=>x===null)||max<=0)return null;
 if(typeof v.postcode!=="string"||!/^\d{4}$/.test(v.postcode.trim())||typeof v.allowedPostcodes!=="string")return null;
 const codes=v.allowedPostcodes.trim()?v.allowedPostcodes.trim().split(/[\s,;]+/):[];
 if(codes.some(x=>!/^\d{4}$/.test(x))||codes.length>500)return null;
 if(distance>max)return {eligible:false,reason:"Avstanden overstiger din valgte grense."};
 if(codes.length&&!codes.includes(v.postcode.trim()))return {eligible:false,reason:"Postnummeret er ikke i det valgte leveringsområdet."};
 const trips=v.service==="both"?2:1;
 const travelOre=Math.round(distance*2*rate/100),perTripOre=base+travelOre+extras,transportOre=perTripOre*trips;
 if(!Number.isSafeInteger(transportOre)||transportOre+rent>2147483647)return null;
 return {eligible:true,trips,drivingKm:distance*2*trips/100,perTripOre,transportOre,travelOre,rentOre:rent,depositOre:deposit,totalOre:rent+transportOre};
}
