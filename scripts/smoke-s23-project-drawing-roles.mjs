import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(path,"utf8");
const permissions=read("lib/projectDrawingPermissions.js").replace(/^export /gm,"");
const {canReadProjectDrawings,canEditProjectDrawings}=new Function(permissions+
 ";return {canReadProjectDrawings,canEditProjectDrawings};")();

const accounts=[
 ["not logged in",null,false,false],
 ["disabled admin",{role:"owner",active:false},false,false],
 ["no permissions",{role:"user",active:true},false,false],
 ["order viewer only",{role:"user",active:true,canViewOrders:true},true,false],
 ["order editor only",{role:"user",active:true,canUpdateOrders:true},true,true],
 ["product editor only",{role:"user",active:true,canManageProducts:true},true,true],
 ["order viewer and editor",{role:"user",active:true,canViewOrders:true,canUpdateOrders:true},true,true],
 ["owner",{role:"owner",active:true},true,true],
 ["fake string flag",{role:"user",active:true,canViewOrders:"true"},false,false]
];
for(const [label,user,readable,writable] of accounts){
 assert.equal(canReadProjectDrawings(user),readable,label+" read");
 assert.equal(canEditProjectDrawings(user),writable,label+" edit");
}

const routeFile=read("app/api/admin/project-drawings/route.js");
const src=routeFile.replace(/^import .*;\n/gm,"")
 .replace(/^export async function (GET|POST|PATCH|DELETE)\(/gm,"async function $1(");
let account=null,dbCalls=0,writes=0,originDenied=false;
const drawing={
 id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001",
 name:"Syntetisk tegning",customer:"Test",drawing_data:{walls:[],items:[]},
 customer_visible:false,updated_at:"2026-11-21T10:00:00Z"
};
const db=()=>{dbCalls++;return {from(table){
 assert.equal(table,"project_drawings");
 const builder={
  select(){return builder},
  eq(){return builder},
  insert(data){writes++;builder.value={...drawing,...data};return builder},
  update(data){writes++;builder.value={...drawing,...data};return builder},
  delete(){writes++;return builder},
  async single(){return {data:builder.value||drawing,error:null}},
  async maybeSingle(){return {data:drawing,error:null}},
  then(resolve,reject){return Promise.resolve({error:null}).then(resolve,reject)}
 };
 return builder;
}}};
const NextResponse={json:(payload,{status=200,headers={}}={})=>({payload,status,headers})};
const actions=new Function("sameOriginGuard","NextResponse","getAdminUser","db",
 "canReadProjectDrawings","canEditProjectDrawings",src+";return {GET,POST,PATCH,DELETE};")(
 ()=>originDenied?NextResponse.json({error:"Cross-site"},{status:403}):null,
 NextResponse,async()=>account,db,canReadProjectDrawings,canEditProjectDrawings
);
const id=drawing.id;
const readRequest={url:"https://www.aadland-service.no/api/admin/project-drawings?id="+id};
const writeRequest={url:"https://www.aadland-service.no/api/admin/project-drawings",
 json:async()=>({id,name:"Changed",drawingData:{walls:[],items:[]}})};
for(const [label,user,readable,writable] of accounts){
 account=user;dbCalls=0;writes=0;originDenied=false;
 const r=await actions.GET(readRequest);
 assert.equal(r.status,readable?200:403,label+" GET");
 if(readable){
  assert.equal(r.payload.drawing.id,id);
  assert.match(r.headers["Cache-Control"],/no-store/);
  assert.equal(writes,0);
 }
 const before=dbCalls;
 for(const verb of ["POST","PATCH","DELETE"]){
  const result=await actions[verb](writeRequest);
  assert.equal(result.status,writable?200:403,label+" "+verb);
  if(!writable){
   assert.equal(dbCalls,before,label+" "+verb+" must be denied before DB");
   assert.equal(writes,0,label+" "+verb+" cannot write");
  }
 }
 if(writable)assert.equal(writes,3,label+" writes once per mutating method");
}
account={role:"owner",active:true};originDenied=true;dbCalls=0;writes=0;
for(const verb of ["POST","PATCH","DELETE"]){
 const r=await actions[verb](writeRequest);
 assert.equal(r.status,403,"Cross-site "+verb);
 assert.equal(dbCalls,0,"CSRF denial must precede DB");
}
originDenied=false;
const badId=await actions.GET({url:"https://www.aadland-service.no/api/admin/project-drawings?id=../../etc"});
assert.equal(badId.status,400);

const archivePage=read("app/admin/tegninger/page.js");
const editorPage=read("app/admin/tegning/page.js");
const archiveUI=read("app/admin/tegninger/DrawingArchiveClient.js");
const viewerPage=read("app/admin/tegninger/[id]/page.js");
const viewer=read("app/min-side/CustomerDrawingViewer.js");
const pdf=read("app/api/admin/project-drawings/report/route.js");

assert.ok(archivePage.includes("canReadProjectDrawings(user)")&&
 archivePage.includes("canEdit={canEditProjectDrawings(user)}"),
 "Archive allows viewer, receives explicit editable flag");
assert.ok(editorPage.includes('if(!canEditProjectDrawings(admin))redirect("/admin/tegninger")'),
 "Editor page prevents view-only staff from loading editing UI");
assert.ok(archiveUI.includes('DrawingArchiveClient({canEdit=false})'));
assert.ok(archiveUI.includes("{canEdit&&<Link")&&archiveUI.includes("Rediger"));
assert.ok(archiveUI.includes("{canEdit&&<button")&&archiveUI.includes("Nytt tilbud"));
assert.ok(archiveUI.includes('href={"/admin/tegninger/"+encodeURIComponent(row.id)}'));
assert.ok(viewerPage.includes("canReadProjectDrawings(admin)"));
assert.ok(viewerPage.includes('select("id,name,customer,address,notes,drawing_data,updated_at,order_id")'));
assert.ok(viewerPage.includes("CustomerDrawingViewer drawing={drawing}"));
assert.ok(viewer.includes("Plantegning")&&viewer.includes("3D"));
assert.ok(!viewerPage.includes('.update(')&&!viewerPage.includes('.delete('),"Read-only preview does not write to DB");
assert.ok(viewerPage.includes("{canEdit&&<Link"),"Editor link withheld from order viewers");
assert.ok(pdf.includes("canReadProjectDrawings(user)"),"PDF creation remains a read-only right");
assert.ok(!pdf.includes("canViewOrders||"),"No duplicated inconsistent permission expression");
const adminAuth=read("lib/auth.js");
assert.ok(adminAuth.includes("sameSessionVersion(session.version,currentVersion)"),
 "Permission uses authenticated, verified active admin session");
console.log("S-23 bestått: view-only can GET but cannot POST/PATCH/DELETE; editors/owner can write; CSRF, invalid IDs, read-only 2D/3D viewer and PDF are protected. No production writes.");

// Summary status must not silently treat an inaccessible publication table as empty.
let publicationFails=true,pagesRead=0;
const summaryDb=()=>({from(table){
 let offset=0;
 const q={select(){return q},order(){return q},limit(){return q},in(k,ids){assert.equal(k,"drawing_id");assert.deepEqual(ids,[id]);return q},range(from,to){offset=from;assert.equal(to,from+499);return q},then(resolve,reject){
  if(table==="project_drawings")return Promise.resolve({data:[drawing],error:null}).then(resolve,reject);
  assert.equal(table,"quote_drawing_publications");pagesRead++;
  return Promise.resolve(publicationFails?{data:null,error:{code:"TEST"}}:{data:offset===0?Array.from({length:500},(_,i)=>({id:"p"+i,drawing_id:id})):[],error:null}).then(resolve,reject);
 }};return q;
}});
const summaryActions=new Function("sameOriginGuard","NextResponse","getAdminUser","db","canReadProjectDrawings","canEditProjectDrawings",src+";return {GET};")(()=>null,NextResponse,async()=>({role:"owner",active:true}),summaryDb,canReadProjectDrawings,canEditProjectDrawings);
const summaryRequest={url:"https://www.aadland-service.no/api/admin/project-drawings?summary=1"};
let summaryResult=await summaryActions.GET(summaryRequest);
assert.equal(summaryResult.status,503);assert.ok(!("publishedIds" in summaryResult.payload));
publicationFails=false;pagesRead=0;summaryResult=await summaryActions.GET(summaryRequest);
assert.equal(summaryResult.status,200);assert.deepEqual(summaryResult.payload.publishedIds,[id]);assert.equal(pagesRead,2);
assert.ok(archiveUI.includes("Delingsstatus kunne ikke bekreftes."));
console.log("S23: sharing summary fails closed, scoped and paginated publication reads, duplicate IDs deduplicated.");
