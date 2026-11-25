import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const policy=readFileSync("app/personvern/page.js","utf8");
for(const phrase of [
 "25. november 2026","COMPANY_INFO","COMPANY_ADDRESS",
 "personvernforordningen artikkel 6","Supabase","Vercel","Resend","Vipps","Tripletex",
 "Have I Been Pwned","Pwned Passwords","fem år etter regnskapsårets slutt",
 "fakturering","innsyn","sletting","begrensning","Datatilsynet",
 "informasjonskapsler","lokalt i nettleseren","EU/EØS","nærmere informasjon"
])assert.ok(policy.includes(phrase),"Personvernerklæring mangler: "+phrase);
assert.ok(!policy.includes("Sist oppdatert: september 2026."));
assert.ok(policy.includes('href={COMPANY_INFO.emailHref}'));
assert.ok(!/selges til annonsører|kun innenfor EØS|automatisk slettes etter/i.test(policy),"Do not promise unverified privacy properties.");
const passwordSecurity=readFileSync("lib/passwordSecurity.js","utf8");
assert.ok(passwordSecurity.includes("hash.slice(0,5)"),"Pwned Passwords oppslaget skal ikke sende hele passordhashen");
assert.ok(passwordSecurity.includes("Add-Padding"),"Pwned Passwords oppslaget skal inkludere response padding");
const sessions=readFileSync("lib/customer-auth.js","utf8");
const admin=readFileSync("lib/auth.js","utf8");
assert.ok(sessions.includes("60*60*24*30"),"Customer session max age still 30 days");
assert.ok(admin.includes("60*60*24*14"),"Admin session max age still 14 days");
assert.ok(readFileSync("app/HomeClient.js","utf8").includes('href="/personvern"'),"Contact form privacy link must remain");
console.log("S-13: personverntekst, mottakere, behandlingsgrunnlag, lagring, rettigheter og cookie-fakta kontrollert.");
