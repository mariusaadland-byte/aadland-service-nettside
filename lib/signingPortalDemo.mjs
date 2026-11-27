// Static fictional rows ONLY. Never combine demo rows with real customer records.
export const SIGNING_PORTAL_STATUSES=Object.freeze({waiting:"Venter på signering",signed:"Signert",expired:"Utløpt",superseded:"Erstattet"});
const rows=[
 {id:"demo-125-2",order:"DEMO-125",revision:2,customer:"Demokunde A",title:"Borhammer og vinkelsliper",status:"waiting",date:"2026-11-27",payableOre:135300,depositOre:200000},
 {id:"demo-125-1",order:"DEMO-125",revision:1,customer:"Demokunde A",title:"Borhammer",status:"superseded",date:"2026-11-25",payableOre:60000,depositOre:150000},
 {id:"demo-112-1",order:"DEMO-112",revision:1,customer:"Demokunde A",title:"Gipssliper",status:"signed",date:"2026-11-24",payableOre:80000,depositOre:100000},
 {id:"demo-099-1",order:"DEMO-099",revision:1,customer:"Demokunde B",title:"Støvsuger",status:"expired",date:"2026-11-23",payableOre:35000,depositOre:50000},
 {id:"demo-089-1",order:"DEMO-089",revision:1,customer:"Demokunde A",title:"Sirkelsag",status:"expired",date:"2026-11-21",payableOre:40000,depositOre:100000}
];
export function demoSigningRows(mode){
 if(mode!=="admin"&&mode!=="customer")return [];
 return rows.filter(r=>mode==="admin"||r.customer==="Demokunde A").map(r=>{const {customer,...safe}=r;return mode==="admin"?{...safe,customer}:safe;});
}
export function signingPortalFilter(rows,status,query){
 if(!Array.isArray(rows))return [];
 const q=String(query??"").trim().toLowerCase().slice(0,100);
 return rows.filter(r=>(status==="all"||r.status===status)&&(!q||[r.order,r.title,r.customer].some(v=>String(v??"").toLowerCase().includes(q))));
}
export function signingPortalCounts(rows){
 return Object.fromEntries(Object.keys(SIGNING_PORTAL_STATUSES).map(status=>[status,rows.filter(r=>r.status===status).length]));
}
