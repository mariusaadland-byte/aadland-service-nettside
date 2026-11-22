import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync("lib/vatPrinterWebscan.js","utf8");
const {vatWebscanLocalAddress}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
for(const addr of ["192.168.1.3","10.0.0.25","172.16.0.1","172.31.255.254"])
 assert.equal(vatWebscanLocalAddress(addr),"http://"+addr+"/");
for(const bad of [
 "https://example.com","localhost","127.0.0.1","8.8.8.8","172.32.1.8",
 "192.169.0.1","192.168.1.0","192.168.1.255","192.168.1.256",
 "192.168.1.1:8080","http://192.168.1.5","192.168.1.7/path","10.1.2.3?foo=bar"
])assert.equal(vatWebscanLocalAddress(bad),"","Printer local URL rejected: "+bad);
const ui=readFileSync("app/admin/faktura/mva/VatPrinterWebscan.js","utf8");
const scanner=readFileSync("app/admin/faktura/mva/VatReceiptScanner.js","utf8");
assert.ok(ui.includes("window.localStorage.getItem(KEY)"),"Remember IP on browser only");
assert.ok(ui.includes("window.localStorage.setItem(KEY,ip.trim())"));
assert.ok(ui.includes('window.open(address,"_blank","noopener,noreferrer")'),"Open local EWS with no opener access");
assert.ok(!ui.includes("fetch(")&&!ui.includes("XMLHttpRequest")&&!ui.includes("document.cookie"));
assert.ok(ui.includes("Webscan")&&ui.includes("Skann")&&ui.includes("Sikkerhet"));
assert.ok(ui.includes("kan ikke hente resultatet")&&ui.includes("velger skannefilen"));
assert.ok(scanner.includes('import VatPrinterWebscan from "./VatPrinterWebscan";'));
assert.ok(scanner.includes('<VatPrinterWebscan disabled={disabled||busy||Boolean(cropJob)}/>'));
console.log("HP Webscan: kun privat lokal IP, nettleserfanen åpnes trygt, husker adresse lokalt og ingen automatisk regnskapslagring.");
