import crypto from "crypto";

function secret(){
 const value=process.env.QUOTE_LINK_SECRET||process.env.SESSION_SECRET;
 if(!value)throw new Error("QUOTE_LINK_SECRET eller SESSION_SECRET mangler.");
 return value;
}

function message(quote){
 return [
  String(quote.id||""),
  String(quote.quote_number||quote.quoteNumber||""),
  String(quote.customer?.email||"").toLowerCase()
 ].join("|");
}

export function createQuoteToken(quote){
 return crypto.createHmac("sha256",secret()).update(message(quote)).digest("hex");
}

export function verifyQuoteToken(quote,token){
 const expected=createQuoteToken(quote);
 const supplied=String(token||"");
 if(!supplied||supplied.length!==expected.length)return false;
 return crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected));
}
