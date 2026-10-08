import "server-only";
import {drawingPageStreams} from "./drawingPdfPages";

export function buildDrawingReportPdf(drawing){
 const pages=drawingPageStreams(drawing);
 const objects=[null,
  Buffer.from("<< /Type /Catalog /Pages 2 0 R >>","ascii"),
  null,
  Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>","ascii"),
  Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>","ascii")
 ];
 const pageIds=[];
 for(let i=0;i<pages.length;i++){
  const pageId=objects.length,contentId=pageId+1;
  const stamp="BT /F1 7 Tf 0.40 0.40 0.40 rg 48 34 Td (Aadland Service - teknisk tegningsvedlegg) Tj ET\n"+
   "BT /F1 8 Tf 0.40 0.40 0.40 rg 482 34 Td (Side "+(i+1)+" / "+pages.length+") Tj ET\n";
  const stream=Buffer.from(pages[i]+stamp,"ascii");
  objects.push(Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents "+contentId+" 0 R >>","ascii"));
  objects.push(Buffer.concat([Buffer.from("<< /Length "+stream.length+" >>\nstream\n","ascii"),stream,Buffer.from("\nendstream","ascii")]));
  pageIds.push(pageId);
 }
 objects[2]=Buffer.from("<< /Type /Pages /Kids ["+pageIds.map(id=>id+" 0 R").join(" ")+"] /Count "+pageIds.length+" >>","ascii");
 const prefix=Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n","binary");
 const parts=[prefix],offsets=[0];let offset=prefix.length;
 for(let id=1;id<objects.length;id++){
  offsets[id]=offset;
  const head=Buffer.from(id+" 0 obj\n","ascii"),body=objects[id],tail=Buffer.from("\nendobj\n","ascii");
  parts.push(head,body,tail);offset+=head.length+body.length+tail.length;
 }
 let xref="xref\n0 "+objects.length+"\n0000000000 65535 f \n";
 for(let id=1;id<objects.length;id++)xref+=String(offsets[id]).padStart(10,"0")+" 00000 n \n";
 xref+="trailer\n<< /Size "+objects.length+" /Root 1 0 R >>\nstartxref\n"+offset+"\n%%EOF";
 parts.push(Buffer.from(xref,"ascii"));
 return Buffer.concat(parts);
}
