import "server-only";
import crypto from "crypto";

// Public customer links are bearer credentials. They expire after 60 days,
// or at the end of the quote's own validity, whichever comes first.
// An authenticated customer can still view issued quote history through
// their separate, cookie-protected Min side session.
export const QUOTE_LINK_MAX_AGE_SECONDS=60*24*60*60;
const MAX_FUTURE_SKEW_SECONDS=5*60;

function secret(){
 const value=process.env.QUOTE_LINK_SECRET||process.env.SESSION_SECRET;
 if(!value)throw new Error("QUOTE_LINK_SECRET eller SESSION_SECRET mangler.");
 return value;
}
function message(quote){
 return [
  String(quote.id||""),
  String(quote.quote_number||quote.quoteNumber||""),
  String(quote.customer?.email||"").trim().toLowerCase()
 ].join("|");
}
function generation(quote){
 const n=Number(quote?.quote_link_generation??1);
 return Number.isSafeInteger(n)&&n>=1&&n<=2147483647?n:null;
}
function digest(payload){
 return crypto.createHmac("sha256",secret()).update(payload).digest("hex");
}
function equalHex(a,b){
 if(!/^[0-9a-f]{64}$/i.test(String(a||"")))return false;
 const x=Buffer.from(String(a).toLowerCase(),"hex"),y=Buffer.from(b,"hex");
 return x.length===y.length&&crypto.timingSafeEqual(x,y);
}
function osloDateKey(now){
 const parts=new Intl.DateTimeFormat("en-GB",{
  timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(new Date(now));
 const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return value.year+"-"+value.month+"-"+value.day;
}
export function quoteLinkPubliclyAllowed(quote,now=Date.now()){
 const at=Number(now);
 if(!quote||!Number.isFinite(at)||generation(quote)===null)return false;
 if(quote.quote_link_disabled_at)return false;
 if(!["sent","accepted","declined"].includes(String(quote.status||"")))return false;
 if(!quote.sent_at)return false;
 if(quote.valid_until&&String(quote.valid_until).slice(0,10)<osloDateKey(at))return false;
 return true;
}

// Retain legacy verification for active, recently sent links only; old
// unsigned-age HMACs do not remain forever and cannot survive rotation.
function verifyLegacyQuoteToken(quote,token,now){
 if(generation(quote)!==1)return false;
 const sentAt=Date.parse(String(quote.sent_at||""));
 const age=Math.floor(now/1000)-Math.floor(sentAt/1000);
 if(!Number.isFinite(sentAt)||age<0||age>QUOTE_LINK_MAX_AGE_SECONDS)return false;
 return equalHex(token,digest(message(quote)));
}

export function createQuoteToken(quote,now=Date.now()){
 const gen=generation(quote);
 if(gen===null||quote?.quote_link_disabled_at)throw Error("Tilbudslenken er sperret.");
 const issued=Math.floor(Number(now)/1000);
 if(!Number.isSafeInteger(issued)||issued<=0)throw Error("Ugyldig lenketidspunkt.");
 const payload=message(quote)+"|v2|"+gen+"|"+issued;
 return "v2."+issued+"."+digest(payload);
}

export function verifyQuoteToken(quote,token,now=Date.now()){
 const at=Number(now);
 if(!quoteLinkPubliclyAllowed(quote,at))return false;
 const supplied=String(token||"");
 if(/^[0-9a-f]{64}$/i.test(supplied))
  return verifyLegacyQuoteToken(quote,supplied,at);
 const match=/^v2\.(\d{10,11})\.([0-9a-f]{64})$/i.exec(supplied);
 if(!match)return false;
 const issued=Number(match[1]),seconds=Math.floor(at/1000);
 if(!Number.isSafeInteger(issued)||issued>seconds+MAX_FUTURE_SKEW_SECONDS||
    seconds-issued>QUOTE_LINK_MAX_AGE_SECONDS)return false;
 const expected=digest(message(quote)+"|v2|"+generation(quote)+"|"+issued);
 return equalHex(match[2],expected);
}
