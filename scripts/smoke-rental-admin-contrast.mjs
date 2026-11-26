import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const lum=h=>{const v=h.match(/../g).map(s=>parseInt(s,16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2]};
const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
for(const [a,b] of [["1c2830","f8f7f4"],["194e55","f8f7f4"],["77551f","f8f7f4"],["57636c","f8f7f4"],["1c2830","ffffff"],["224950","ffffff"],["57636c","ffffff"],["ffffff","224950"],["654414","fff6dd"],["224950","f1f6f5"],["57636c","f1f6f5"]])assert.ok(contrast(a,b)>=4.5,a+"/"+b);
const root="app/admin/utleie/";
for(const path of ["oversikt/dashboard.module.css","enheter/units.module.css","lonnsomhet/profitability.module.css","depositum/deposit.module.css","vipps-oppsett/rentalVippsSetup.module.css"]){const css=read(root+path);assert.ok(css.includes("background:#f8f7f4"),path);assert.ok(css.includes("focus-visible"),path);assert.ok(css.includes("#224950"),path);}
assert.ok(read(root+"oversikt/dashboard.module.css").includes("background:#ffffff;border:1px solid #dddcd6"));
assert.ok(read(root+"oversikt/dashboard.module.css").includes(".action,.action:visited{background:#224950;color:#fff"));
assert.ok(read(root+"enheter/units.module.css").includes("-webkit-text-fill-color:#1c2830"));
assert.ok(read(root+"lonnsomhet/profitability.module.css").includes(".stats small{color:#57636c}"));
console.log("Rental admin light palette: explicit readable backgrounds, teal controls, white cards and form/focus contrast passed.");
