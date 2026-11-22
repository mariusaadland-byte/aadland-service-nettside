import {deflateRawSync} from "node:zlib";
import {chromeOsScannerExtensionFiles} from "../../../../../lib/chromeOsScannerExtensionFiles";
export const runtime="nodejs";
// Small dependency-free ZIP writer; sources stay in repo and can be audited.
function crc32(bytes){
 let crc=0xffffffff;
 for(const value of bytes){
  crc^=value;
  for(let i=0;i<8;i++)crc=(crc>>>1)^(crc&1?0xedb88320:0);
 }
 return (crc^0xffffffff)>>>0;
}
function zip(files){
 const local=[],central=[];
 let offset=0;
 for(const [name,source] of Object.entries(files)){
  const fname=Buffer.from(name),raw=Buffer.from(source,"utf8"),packed=deflateRawSync(raw),crc=crc32(raw);
  const header=Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);
  header.writeUInt16LE(0,6);header.writeUInt16LE(8,8);
  header.writeUInt32LE(crc,14);header.writeUInt32LE(packed.length,18);
  header.writeUInt32LE(raw.length,22);header.writeUInt16LE(fname.length,26);
  local.push(header,fname,packed);
  const directory=Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50,0);
  directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);
  directory.writeUInt16LE(8,10);directory.writeUInt32LE(crc,16);
  directory.writeUInt32LE(packed.length,20);directory.writeUInt32LE(raw.length,24);
  directory.writeUInt16LE(fname.length,28);directory.writeUInt32LE(offset,42);
  central.push(directory,fname);
  offset+=header.length+fname.length+packed.length;
 }
 const center=Buffer.concat(central);
 const end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(0,4);end.writeUInt16LE(0,6);
 end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);
 end.writeUInt32LE(center.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,center,end]);
}
export async function GET(){
 const archive=zip(chromeOsScannerExtensionFiles);
 return new Response(archive,{
  headers:{
   "Content-Type":"application/zip",
   "Content-Disposition":'attachment; filename="aadland-chromebook-skanner.zip"',
   "X-Content-Type-Options":"nosniff",
   "Cache-Control":"private, no-store"
  }
 });
}
