// Plain ZIP STORE writer: no external dependencies and no changes to original PDFs.
// Reject missing/invalid frozen PDFs rather than quietly generating recreated versions.
const crcTable=Array.from({length:256},(_,k)=>{
 let c=k;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;
});
const crc32=bytes=>{
 let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);
 return (c^0xffffffff)>>>0;
};
export function zipFrozenInvoicePdfs(items){
 if(!Array.isArray(items)||items.length<1||items.length>500)
  throw Error("ZIP krever mellom 1 og 500 fakturaer.");
 const parts=[],index=[],used=new Set();let offset=0,combined=0;
 for(const [i,row] of items.entries()){
  const invoice=row.invoice||row;
  if(!invoice.pdf_base64||typeof invoice.pdf_base64!=="string")
   throw Error("En av fakturaene mangler fryst original-PDF.");
  const bytes=Buffer.from(invoice.pdf_base64,"base64");
  if(bytes.subarray(0,5).toString()!=="%PDF-"||bytes.length<100||bytes.length>8*1024*1024)
   throw Error("En original-PDF er ugyldig eller for stor.");
  combined+=bytes.length;
  if(combined>80*1024*1024)throw Error("PDF-arkivet overstiger 80 MB.");
  let filename="Aadland-faktura-"+String(invoice.invoice_number||i+1)
   .replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,60)+".pdf";
  if(used.has(filename))filename="Aadland-faktura-"+String(i+1)+".pdf";
  used.add(filename);
  const name=Buffer.from(filename,"utf8"),checksum=crc32(bytes);
  const local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);
  local.writeUInt16LE(20,4);
  local.writeUInt16LE(0x0800,6); // UTF-8 filename
  local.writeUInt16LE(0,8); // no compression
  local.writeUInt32LE(checksum,14);
  local.writeUInt32LE(bytes.length,18);
  local.writeUInt32LE(bytes.length,22);
  local.writeUInt16LE(name.length,26);
  parts.push(local,name,bytes);
  const central=Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50,0);
  central.writeUInt16LE(20,4);
  central.writeUInt16LE(20,6);
  central.writeUInt16LE(0x0800,8);
  central.writeUInt32LE(checksum,16);
  central.writeUInt32LE(bytes.length,20);
  central.writeUInt32LE(bytes.length,24);
  central.writeUInt16LE(name.length,28);
  central.writeUInt32LE(offset,42);
  index.push(central,name);
  offset+=local.length+name.length+bytes.length;
 }
 const directory=Buffer.concat(index),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);
 end.writeUInt16LE(items.length,8);
 end.writeUInt16LE(items.length,10);
 end.writeUInt32LE(directory.length,12);
 end.writeUInt32LE(offset,16);
 return Buffer.concat([...parts,directory,end]);
}
