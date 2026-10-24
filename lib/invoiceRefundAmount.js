// Convert a deliberately entered Norwegian kroner amount to integer øre.
// Never accept exponent notation, negative values or more than two decimals.
export function parseRefundAmountOre(raw, availableOre){
 const input=String(raw??"").trim();
 if(!/^\d+(?:[,.]\d{1,2})?$/.test(input))
  throw Error("Bruk kroner og maks to desimaler, for eksempel 125,50.");
 const [whole,decimal=""]=input.replace(",",".").split(".");
 const amount=Number(whole)*100+Number(decimal.padEnd(2,"0"));
 if(!Number.isSafeInteger(amount)||amount<=0||!Number.isSafeInteger(availableOre)||
    amount>availableOre)throw Error("Beløpet må være større enn null og kan ikke overstige tilgjengelig refusjon.");
 return amount;
}
