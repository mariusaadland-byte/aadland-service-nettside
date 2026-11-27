import "server-only";
export const costAllocationEnabled=()=>process.env.VERCEL_ENV==="production"&&process.env.AADLAND_COST_ALLOCATION_ENABLED==="true";

export const costHistoryEnabled=()=>costAllocationEnabled()&&process.env.AADLAND_COST_HISTORY_ENABLED==="true";
