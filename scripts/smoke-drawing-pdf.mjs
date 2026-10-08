import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const pageCode=readFileSync("lib/drawingPdfPages.js","utf8").replace('import "server-only";',"");
const pageUrl="data:text/javascript;base64,"+Buffer.from(pageCode).toString("base64");
const pages=await import(pageUrl);
const reportCode=readFileSync("lib/drawingReportPdf.js","utf8")
 .replace('import "server-only";',"")
 .replace('from "./drawingPdfPages";','from "'+pageUrl+'";');
const report=await import("data:text/javascript;base64,"+Buffer.from(reportCode).toString("base64"));
const w=4000,h=3000;
const points=[{x:300,y:300},{x:4300,y:300},{x:4300,y:3300},{x:300,y:3300}];
const walls=points.map((p,i)=>({id:"wall-"+i,x1:p.x,y1:p.y,x2:points[(i+1)%4].x,y2:points[(i+1)%4].y,t:98,h:2400}));
const drawing={name:"Test av plan og vegger",customer:"Testkunde",walls,zones:[{name:"Stue",points,enteredInnerWidth:w,enteredInnerHeight:h}],items:[{id:"bed",type:"bed",x:700,y:1000,w:1800,h:2000,rot:0},{id:"window",type:"window",wallId:"wall-0",wallOffset:2000,w:1100,openingHeight:1200,sillHeight:900}]};
const streams=pages.drawingPageStreams(drawing);
assert.equal(streams.length,5,"Plantegning og fire veggtegninger");
assert.ok(streams[0].includes("PLANTEGNING"),"Plantegning mangler");
assert.ok(streams[1].includes("VEGGTEGNING 1"),"Veggtegning mangler");
const pdf=report.buildDrawingReportPdf(drawing);
assert.ok(pdf.subarray(0,8).toString("ascii")==="%PDF-1.4","PDF-header mangler");
assert.equal((pdf.toString("latin1").match(/\/Type \/Page \/Parent/g)||[]).length,5,"Feil antall PDF-sider");
assert.ok(pdf.toString("latin1").includes("%%EOF"),"PDF er ikke avsluttet");
console.log("PDF-sjekk bestått: 1 plantegning, 4 veggtegninger, 5 PDF-sider.");
