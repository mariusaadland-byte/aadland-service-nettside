// Navigational only. These links point to verified existing owner-admin pages.
// A link does not imply that the related feature is finished or approved.
const EXACT={
 drawing_precision:"/admin/tegning",
 drawing_builder:"/admin/tegning",
 quote_pdf:"/admin/tilbud",
 suppliers:"/admin/prisliste",
 vipps:"/admin/vipps-oppgjor",
 calculator:"/admin/kalkulator",
 quotes_orders:"/admin/tilbud",
 rental_booking:"/admin/utleie",
 customer_drawings:"/admin/tegninger",
 emails:"/admin/tilbud",
 responsive:"/admin",
 roadmap:"/admin/utviklingsplan",
 "custom-drawing-customer-20261008":"/admin/tegning",
 "custom-drawing-report-20261008":"/admin/tegning",
 "custom-drawing-mobile-menu-20261008":"/admin/tegning",
 "custom-kitchen-open-walls-20261008":"/admin/tegning",
 "custom-drawing-customer-archive-20261008":"/admin/tegninger",
 "custom-drawing-customer-publication-20261008":"/admin/tegninger",
 "custom-material-shared-prices-20261008":"/admin/prisliste",
 "custom-price-search-direct-to-quote-20261008":"/admin/tilbud",
 "custom-quote-private-margin-pdf-20261009":"/admin/tilbud",
 "custom-manual-product-price-list-20261021":"/admin/prisliste",
 "custom-customer-access-isolation-20261021":"/admin/tegninger",
 "custom-rental-deposit-reminders-20261021":"/admin/utleie",
 "custom-vipps-fee-price-preview-20261022":"/admin/vipps-kostnadskalkulator",
 "custom-customer-payment-terms-20261021":"/admin/faktura/arkiv",
 "custom-own-debt-collection-deferred-20261021":"/admin/faktura/arkiv",
 "custom-external-tripletex-paid-20261120":"/admin/faktura/eksterne",
 "custom-external-ledger-review-20261120":"/admin/regnskap",
 "custom-tripletex-original-pdf-20261120":"/admin/faktura/eksterne",
 "custom-external-vat-double-count-20261120":"/admin/faktura/mva"
};
export function developmentTaskLink(task){
 const id=typeof task==="string"?task:String(task?.id||"");
 if(!id)return null;
 if(EXACT[id])return EXACT[id];
 if(id.startsWith("custom-invoice-"))return "/admin/faktura/arkiv";
 return null;
}
export function developmentNextTasks(tasks,limit=6){
 if(!Array.isArray(tasks))return [];
 const order={progress:0,test:1,todo:2};
 return tasks.filter(t=>t&&t.status!=="done"&&t.priority==="high")
  .sort((a,b)=>(order[a.status]??3)-(order[b.status]??3)||
   (Number(a.sortOrder)||1000)-(Number(b.sortOrder)||1000)||
   String(a.id).localeCompare(String(b.id))).slice(0,limit);
}
