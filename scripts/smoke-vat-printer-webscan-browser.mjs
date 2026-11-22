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
assert.ok(ui.includes("window.localStorage.getItem(IP_KEY)"),"Remember IP on browser only");
assert.ok(ui.includes("window.localStorage.setItem(IP_KEY,ip.trim())"));
assert.ok(ui.includes('window.open(address,"_blank","noopener,noreferrer")'),"Open local EWS with no opener access");
assert.ok(!ui.includes("fetch(")&&!ui.includes("XMLHttpRequest")&&!ui.includes("document.cookie"));
assert.ok(ui.includes("Webscan")&&ui.includes("Skann")&&ui.includes("Sikkerhet"));
assert.ok(ui.includes("kan ikke hente skanninger")&&ui.includes("Velg mange PDF-er / bilder"));
assert.ok(scanner.includes('import VatPrinterWebscan from "./VatPrinterWebscan";'));
assert.ok(scanner.includes('<VatPrinterWebscan disabled={disabled||busy||Boolean(cropJob)}/>'));
assert.ok(ui.includes('const PIN_KEY="aadland-vat-local-hp-webscan-pin"'));
assert.ok(ui.includes('window.localStorage.getItem(PIN_KEY)'));
assert.ok(ui.includes('window.localStorage.setItem(PIN_KEY,pin.trim())'));
assert.ok(ui.includes('window.localStorage.removeItem(PIN_KEY)'));
assert.ok(ui.includes('validPrinterPin(pin)')&&ui.includes('type={pinVisible?"text":"password"}'));
assert.ok(ui.includes('navigator.clipboard.writeText(pin.trim())'));
assert.ok(ui.includes("Lagre PIN på denne enheten")&&ui.includes("Kopier PIN")&&ui.includes("Slett lagret PIN"));
assert.ok(ui.includes("Lokal lagring er ikke kryptert separat"));
assert.ok(ui.includes("window.dispatchEvent(new Event(PIN_UPDATED))"));
assert.ok(ui.includes('window.addEventListener("storage",onStorage)'));
assert.ok(!/\b\d{8}\b/.test(ui),"Do not commit any eight-digit printer PIN into public source");
assert.ok(!ui.includes("PIN_KEY,ip")&&!ui.includes('address+"?pin="'),
 "Never put printer PIN into printer URL");
console.log("HP Webscan: kun privat lokal IP, nettleserfanen åpnes trygt, husker adresse lokalt og ingen automatisk regnskapslagring.");
