// Display-only estimate for the manual Aadland Service MVA reconciliation.
// It is not the final amount owed to or refundable by Skatteetaten.
export function vatSettlementPreview(comparison){
 if(comparison?.estimateAllowed!==true)return null;
 const output=comparison?.outputVatOre,input=comparison?.inputVatOre,delta=comparison?.differenceOre;
 if(!Number.isSafeInteger(output)||!Number.isSafeInteger(input)||!Number.isSafeInteger(delta)||
   !Number.isSafeInteger(output-input)||output-input!==delta)return null;
 if(delta>0)return {direction:"payable",label:"Foreløpig å betale til Skatteetaten",amountOre:delta};
 if(delta<0)return {direction:"receivable",label:"Foreløpig MVA til gode",amountOre:-delta};
 return {direction:"balanced",label:"Foreløpig MVA i balanse",amountOre:0};
}
