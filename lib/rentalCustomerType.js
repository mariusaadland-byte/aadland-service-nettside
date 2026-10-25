export function validNorwegianOrganizationNumber(input){
 const digits=String(input??"").replace(/\s/g,"");
 if(!/^\d{9}$/.test(digits))return false;
 const weights=[3,2,7,6,5,4,3,2];
 let sum=0;
 for(let i=0;i<8;i++)sum+=Number(digits[i])*weights[i];
 const check=11-(sum%11);
 return check!==10&&Number(digits[8])===(check===11?0:check);
}
export function rentalCustomerClassification(payload){
 const type=payload?.customerType??"private";
 if(!["private","company"].includes(type))return {error:"Velg privatperson eller bedrift."};
 if(type==="private")return {type:"private",company:null};
 const companyName=String(payload?.company?.name??"").trim().replace(/\s+/g," ").slice(0,180);
 const orgNumber=String(payload?.company?.organizationNumber??"").replace(/\s/g,"");
 const invoiceEmail=String(payload?.company?.invoiceEmail??"").trim().toLowerCase().slice(0,254);
 if(companyName.length<2)return {error:"Fyll inn firmanavn."};
 if(!validNorwegianOrganizationNumber(orgNumber))return {error:"Organisasjonsnummeret er ugyldig. Kontroller de 9 sifrene."};
 if(invoiceEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoiceEmail))
  return {error:"Skriv inn en gyldig faktura-e-post."};
 return {type:"company",company:{name:companyName,organizationNumber:orgNumber,invoiceEmail}};
}
