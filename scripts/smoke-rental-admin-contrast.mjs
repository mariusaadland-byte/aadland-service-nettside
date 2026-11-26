import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const lum=h=>{const v=h.match(/../g).map(s=>parseInt(s,16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2]};
const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
for(const [a,b] of [["171717","f4f0e7"],["77551f","f4f0e7"],["4b463f","f4f0e7"],["f5f1e8","191919"],["e8bd70","191919"],["c7c1b7","191919"],["d7d1c7","191919"],["171717","ffffff"],["4b463f","ffffff"]])assert.ok(contrast(a,b)>=4.5,a+"/"+b);
const root="app/admin/utleie/";
for(const path of ["oversikt/dashboard.module.css","enheter/units.module.css","lonnsomhet/profitability.module.css"]){const css=read(root+path);assert.ok(css.includes("background:#f4f0e7;color:#171717;color-scheme:light"),path);assert.ok(css.includes("focus-visible"),path);}
assert.ok(read(root+"oversikt/dashboard.module.css").includes("color:#f5f1e8;text-decoration:none"));
assert.ok(read(root+"enheter/units.module.css").includes("-webkit-text-fill-color:#171717"));
assert.ok(read(root+"lonnsomhet/profitability.module.css").includes(".stats small{color:#d7d1c7}"));
console.log("Rental admin contrast: explicit backgrounds, readable text, dark cards, focus and form contrast passed.");
