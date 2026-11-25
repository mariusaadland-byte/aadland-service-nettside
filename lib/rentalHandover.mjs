const lists={
 active:[["identity","Riktig kunde, booking og utstyr kontrollert"],["condition","Tilstand, funksjon og tilbehør kontrollert"],["instructions","Bruksanvisning, sikkerhet og returdato gjennomgått"],["settlement","Betaling og depositum kontrollert eller avvik avtalt"]],
 returned:[["equipment","Utstyr og medfølgende deler kontrollert ved retur"],["condition","Tilstand, rengjøring og eventuelle skader vurdert"],["settlement","Eventuelle skader, mangler og videre oppgjør dokumentert eller avtalt"]]
};
export function rentalHandoverChecklist(status){return lists[status]||[];}
export function rentalHandoverRecord(booking,status,input,at){
 const fields=rentalHandoverChecklist(status);
 if(!fields.length)return {error:"Ugyldig kontrolltype."};
 if(!input||!fields.every(([key])=>input.checks?.[key]===true))return {error:"Bekreft alle kontrollpunktene før du endrer status."};
 const note=String(input.note??"").trim();
 if(note.length>700)return {error:"Kontrollmerknaden kan være maks 700 tegn."};
 const depositMissing=status==="active"&&Number(booking.deposit_ore)>0&&(booking.deposit_status!=="held"||Number(booking.deposit_held_ore)<Number(booking.deposit_ore));
 if(depositMissing&&note.length<10)return {error:"Depositum er ikke registrert fullt mottatt/holdt. Beskriv avtalt avvik før utlevering."};
 if(input.deviation===true&&note.length<10)return {error:"Beskriv avviket med minst 10 tegn."};
 const heading=status==="active"?"UTLEVERINGSKONTROLL":"RETURKONTROLL";
 const text=heading+" · "+at+"\n"+fields.map(([,label])=>"✓ "+label).join("\n")+"\n"+(note?"Merknad: "+note:"Ingen merknad.");
 const previous=String(booking.admin_note||"").trim();
 const combined=previous?previous+"\n\n"+text:text;
 if(combined.length>5000)return {error:"Notathistorikken er full. Ta vare på eksisterende dokumentasjon før du fortsetter."};
 return {note:combined};
}
