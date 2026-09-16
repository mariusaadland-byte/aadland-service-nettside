export const fallbackProducts = [
  {id:"bench-spiler",slug:"spilebenk",name:"Spilebenk",category:"Benker",eyebrow:"Favoritt",description:"En enkel og solid benk med tydelig treverk og et rolig uttrykk. Tilpasses etter plassen du har.",basePriceOre:299000,options:[{id:"length",label:"Lengde",choices:[{label:"120 cm",value:"120 cm",extraOre:0},{label:"160 cm",value:"160 cm",extraOre:90000},{label:"200 cm",value:"200 cm",extraOre:180000}]},{id:"finish",label:"Overflate",choices:[{label:"Ubehandlet",value:"Ubehandlet",extraOre:0},{label:"Oljet",value:"Oljet",extraOre:25000},{label:"Svartbeiset",value:"Svartbeiset",extraOre:35000}]}],featured:true,active:true},
  {id:"planter-box",slug:"plantekasse",name:"Plantekasse",category:"Uteplassen",eyebrow:"Tilpasses uteplassen",description:"Plantekasser bygget etter ønsket mål, med plass til urter, blomster eller grønne planter.",basePriceOre:169000,options:[{id:"length",label:"Lengde",choices:[{label:"60 cm",value:"60 cm",extraOre:0},{label:"90 cm",value:"90 cm",extraOre:50000},{label:"120 cm",value:"120 cm",extraOre:90000}]},{id:"finish",label:"Overflate",choices:[{label:"Ubehandlet",value:"Ubehandlet",extraOre:0},{label:"Oljet",value:"Oljet",extraOre:25000},{label:"Svartbeiset",value:"Svartbeiset",extraOre:35000}]}],featured:true,active:true},
  {id:"coffee-table",slug:"kaffebord",name:"Kaffebord",category:"Bord",eyebrow:"Håndlaget i tre",description:"Et rent og robust kaffebord som kan lages smalt, lavt eller stort nok til hele sofasonen.",basePriceOre:249000,options:[{id:"size",label:"Størrelse",choices:[{label:"70 × 50 cm",value:"70 × 50 cm",extraOre:0},{label:"90 × 60 cm",value:"90 × 60 cm",extraOre:80000},{label:"120 × 70 cm",value:"120 × 70 cm",extraOre:150000}]},{id:"finish",label:"Overflate",choices:[{label:"Ubehandlet",value:"Ubehandlet",extraOre:0},{label:"Oljet",value:"Oljet",extraOre:25000},{label:"Svartbeiset",value:"Svartbeiset",extraOre:35000}]}],featured:false,active:true}
];
export const nok = ore => new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",maximumFractionDigits:0}).format(ore/100);
export function productPrice(p, selected={}) {
  return p.basePriceOre + (p.options||[]).reduce((sum,o)=>{
    const value=selected[o.id] ?? o.choices?.[0]?.value;
    return sum + (o.choices?.find(c=>c.value===value)?.extraOre ?? 0);
  },0);
}
