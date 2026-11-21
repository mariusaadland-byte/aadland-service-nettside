// Browser-safe common rule: a supplier with no override inherits the company rate.
export const FALLBACK_MATERIAL_MARKUP = 15;

export function materialMarkupOrFallback(value, fallback=FALLBACK_MATERIAL_MARKUP){
 const defaultValue=Number(fallback);
 const safeDefault=Number.isFinite(defaultValue)&&defaultValue>=0&&defaultValue<=1000?defaultValue:FALLBACK_MATERIAL_MARKUP;
 if(value===null||value===undefined||value==="")return safeDefault;
 const parsed=Number(value);
 return Number.isFinite(parsed)&&parsed>=0&&parsed<=1000?parsed:safeDefault;
}
