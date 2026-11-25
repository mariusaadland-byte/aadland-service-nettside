export const rentalContactTopics={
 availability:"Utstyr og tilgjengelighet",booking:"Booking og endring",return:"Tilbakelevering",deposit:"Betaling og depositum",business:"Bedriftsleie",other:"Annet"
};
export function validateRentalContact(body){
 const read=(key,max)=>typeof body?.[key]==="string"&&body[key].trim().length<=max?body[key].trim():null;
 const name=read("name",120),email=read("email",254),phone=read("phone",40),booking=read("booking",60),message=read("message",3000),topic=read("topic",40);
 if(!name||!email||!message||message.length<10||phone===null||booking===null||!topic||!Object.hasOwn(rentalContactTopics,topic)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||/[\r\n]/.test(name+email+phone+booking))return null;
 return {name,email,phone,booking,message,topic};
}
export function rentalContactText(v){
 return ["Henvendelse fra Aadland Utleie","Emne: "+rentalContactTopics[v.topic],"Navn: "+v.name,"E-post: "+v.email,"Telefon: "+(v.phone||"Ikke oppgitt"),"Booking: "+(v.booking||"Ikke oppgitt"),"",v.message].join("\n");
}
