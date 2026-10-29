// PDF.js often returns each label/value as separate items in arbitrary order.
// Rebuild visual rows before passing text to the Norwegian invoice parser.
// The extracted text stays on the user's device, like the current OCR.
export function vatPdfTextRows(items){
 const valid=(items||[]).filter(item=>item&&typeof item.str==="string"&&item.str.trim());
 if(!valid.length)return "";
 if(valid.some(item=>!Array.isArray(item.transform)||!Number.isFinite(item.transform[4])||
   !Number.isFinite(item.transform[5])))
  return valid.map(x=>x.str+(x.hasEOL?"\n":" ")).join("");
 const positions=valid.map((item,index)=>({
  str:item.str.trim(),x:item.transform[4],y:item.transform[5],index,
  size:Math.abs(item.transform[3])||10
 }));
 positions.sort((a,b)=>b.y-a.y||a.x-b.x||a.index-b.index);
 const rows=[];
 for(const item of positions){
  // Printed lines can have modest font-position variations, but do not
  // join genuinely separate invoice rows merely because they share a column.
  const nearby=rows.find(row=>Math.abs(row.y-item.y)<=Math.min(3,Math.max(1.5,item.size*.28)));
  if(nearby){nearby.items.push(item);}
  else rows.push({y:item.y,items:[item]});
 }
 rows.sort((a,b)=>b.y-a.y);
 return rows.map(row=>row.items.sort((a,b)=>a.x-b.x||a.index-b.index)
  .map(item=>item.str).join(" ").replace(/[ \t]+/g," ").trim()).filter(Boolean).join("\n");
}
