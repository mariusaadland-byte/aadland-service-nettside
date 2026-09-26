export function safeEmail(value){
 const email=String(value||"").trim().toLowerCase();
 if(!email||email.length>254)return "";
 return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:"";
}

export function safePhone(value){
 const phone=String(value||"").trim();
 if(!phone||phone.length>40)return "";
 return /^[+0-9][0-9 +().-]{4,39}$/.test(phone)?phone:"";
}
