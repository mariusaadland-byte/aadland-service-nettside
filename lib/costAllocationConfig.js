import "server-only";
export const costAllocationEnabled=()=>process.env.VERCEL_ENV==="production"&&process.env.AADLAND_COST_ALLOCATION_ENABLED==="true";
