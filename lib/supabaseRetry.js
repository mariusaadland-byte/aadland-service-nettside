import "server-only";

const RETRYABLE_CODES=new Set(["PGRST303"]);

function wait(ms){
 return new Promise(resolve=>setTimeout(resolve,ms));
}

export async function withSupabaseRetry(factory,{retries=2,delayMs=350}={}){
 let result;
 const attempts=Math.max(1,Number(retries)||1);
 for(let attempt=0;attempt<attempts;attempt++){
  result=await factory();
  const code=String(result?.error?.code||"");
  if(!RETRYABLE_CODES.has(code)||attempt===attempts-1)return result;
  await wait(delayMs*(attempt+1));
 }
 return result;
}

export function isSupabaseClockSkewError(error){
 return String(error?.code||"")==="PGRST303"&&String(error?.message||"").toLowerCase().includes("future");
}
