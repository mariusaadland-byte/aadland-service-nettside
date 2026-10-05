import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";

const MODEL=process.env.MATERIAL_AI_MODEL||"gpt-5.6-terra";

async function allowed(){
 const user=await getAdminUser();
 return Boolean(user&&(user.role==="owner"||await hasPermission("canUpdateOrders")||await hasPermission("canManageProducts")));
}

function outputText(response){
 const chunks=[];
 for(const item of response?.output||[]){
  if(item?.type!=="message")continue;
  for(const part of item.content||[])if(part?.type==="output_text"&&typeof part.text==="string")chunks.push(part.text);
 }
 return chunks.join("\n").trim();
}
function num(value,min=0,max=1e9){
 const n=Number(value);
 return Number.isFinite(n)?Math.min(max,Math.max(min,n)):0;
}
function normalize(result){
 const lines=(Array.isArray(result?.lines)?result.lines:[]).slice(0,80).map((line,index)=>{
  const required=num(line.requiredQuantity),waste=num(line.wastePercent,0,100),packageSize=num(line.packageSize),purchaseRaw=required*(1+waste/100),packages=packageSize>0?Math.ceil(purchaseRaw/packageSize):0,purchaseQuantity=packageSize>0?packages*packageSize:purchaseRaw;
  return {
   id:String(line.id||"material-"+(index+1)).slice(0,80),
   material:String(line.material||"Materiale").slice(0,180),
   specification:String(line.specification||"").slice(0,400),
   basis:String(line.basis||"").slice(0,700),
   calculation:String(line.calculation||"").slice(0,700),
   requiredQuantity:Number(required.toFixed(3)),
   unit:String(line.unit||"stk").slice(0,20),
   wastePercent:Number(waste.toFixed(2)),
   purchaseQuantity:Number(purchaseQuantity.toFixed(3)),
   packageSize:Number(packageSize.toFixed(3)),
   packageUnit:String(line.packageUnit||line.unit||"stk").slice(0,30),
   packages,
   supplierSearch:String(line.supplierSearch||line.material||"").slice(0,240),
   confidence:["high","medium","low"].includes(line.confidence)?line.confidence:"medium"
  };
 });
 return {
  summary:String(result?.summary||"").slice(0,1500),
  missingFacts:(Array.isArray(result?.missingFacts)?result.missingFacts:[]).slice(0,30).map(v=>String(v).slice(0,300)),
  warnings:(Array.isArray(result?.warnings)?result.warnings:[]).slice(0,30).map(v=>String(v).slice(0,300)),
  lines
 };
}

const schema={
 type:"object",
 additionalProperties:false,
 properties:{
  summary:{type:"string"},
  missingFacts:{type:"array",items:{type:"string"}},
  warnings:{type:"array",items:{type:"string"}},
  lines:{
   type:"array",
   items:{
    type:"object",
    additionalProperties:false,
    properties:{
     id:{type:"string"},
     material:{type:"string"},
     specification:{type:"string"},
     basis:{type:"string"},
     calculation:{type:"string"},
     requiredQuantity:{type:"number"},
     unit:{type:"string"},
     wastePercent:{type:"number"},
     purchaseQuantity:{type:"number"},
     packageSize:{type:"number"},
     packageUnit:{type:"string"},
     packages:{type:"integer"},
     supplierSearch:{type:"string"},
     confidence:{type:"string",enum:["high","medium","low"]}
    },
    required:["id","material","specification","basis","calculation","requiredQuantity","unit","wastePercent","purchaseQuantity","packageSize","packageUnit","packages","supplierSearch","confidence"]
   }
  }
 },
 required:["summary","missingFacts","warnings","lines"]
};

export async function POST(req){
 const originError=sameOriginGuard(req);if(originError)return originError;
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:"AI er ikke koblet til ennå.",setupRequired:true,requiredEnv:["OPENAI_API_KEY"],model:MODEL},{status:503});
 const body=await req.json().catch(()=>({}));
 const facts=String(body.facts||"").trim().slice(0,16000),materials=String(body.materials||"").trim().slice(0,10000),project=String(body.project||"").trim().slice(0,300);
 if(!facts)return NextResponse.json({error:"Legg inn fakta og mål for jobben."},{status:400});
 if(!materials)return NextResponse.json({error:"Skriv hvilke materialer du vil bruke."},{status:400});
 const input=[
  project?"Prosjekt: "+project:"",
  "FAKTA OG MÅL FRA BRUKER:",
  facts,
  "",
  "MATERIALER BRUKEREN HAR VALGT:",
  materials
 ].filter(Boolean).join("\n");
 const instructions=[
  "Du er materialkalkulator for et norsk håndverksfirma.",
  "Brukerens valgte materialtyper er styrende. Ikke bytt materiale uten å varsle.",
  "Regn ut materialmengder fra oppgitte fakta. Ikke finn på manglende mål.",
  "Hvis informasjon mangler for sikker beregning, legg det i missingFacts og sett lav confidence på berørte linjer.",
  "Ta hensyn til areal, løpemeter, c/c-avstand, antall lag, kapp/svinn, pakningsstørrelse og avrunding opp til hele innkjøpsenheter når relevant.",
  "Velg moderat og faglig begrunnet svinnprosent når brukeren ikke har oppgitt den; forklar dette i basis/calculation.",
  "requiredQuantity er teoretisk behov før svinn. wastePercent er svinnpåslag. packageSize er 0 dersom materialet ikke kjøpes i fast pakning.",
  "Ikke oppgi priser. Pris kobles mot leverandør etterpå.",
  "Svar kun i det strukturerte skjemaet."
 ].join(" ");
 try{
  const response=await fetch("https://api.openai.com/v1/responses",{
   method:"POST",
   headers:{"content-type":"application/json","authorization":"Bearer "+process.env.OPENAI_API_KEY},
   body:JSON.stringify({
    model:MODEL,
    reasoning:{effort:"medium"},
    instructions,
    input,
    text:{format:{type:"json_schema",name:"material_calculation",strict:true,schema}}
   })
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)return NextResponse.json({error:data?.error?.message||"AI-beregningen feilet."},{status:502});
  const text=outputText(data);
  if(!text)return NextResponse.json({error:"AI-en returnerte ikke et beregningsresultat."},{status:502});
  let parsed;try{parsed=JSON.parse(text)}catch{return NextResponse.json({error:"AI-resultatet kunne ikke leses."},{status:502})}
  return NextResponse.json({result:normalize(parsed),model:data.model||MODEL});
 }catch{
  return NextResponse.json({error:"AI-tjenesten er utilgjengelig akkurat nå."},{status:502});
 }
}
