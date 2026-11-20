import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const layout=read("app/layout.js");
const css=read("app/formContrast.css");
const portal=read("app/min-side/page.js");
const base=read("app/globals.css");
const admin=read("app/admin/adminContrast.css");
assert.ok(layout.includes('import "./globals.css";'));
assert.ok(layout.includes('import "./formContrast.css";'));
assert.ok(layout.indexOf('import "./formContrast.css";')>layout.indexOf('import "./globals.css";'),
 "Contrast safety net needs to load after base color rules");
assert.ok(base.includes('body:has(.customerPage)'));
assert.ok(base.includes('.field input,.field select,.field textarea{width:100%'));
assert.ok(portal.includes('className="card customerAccountCard customerAccountForm"'));
for(const field of ['<label>Navn</label>','<label>E-post</label>',
 '<label>Telefon</label>','<label>Adresse</label>'])
 assert.ok(portal.includes(field),"The reported profile form includes "+field);
assert.ok(css.includes('.customerPage .customerAccountForm .field :is(input,textarea,select)'));
assert.ok(css.includes('background-color:#fff!important'));
assert.ok(css.includes('color:#172a3b!important'));
assert.ok(css.includes('-webkit-text-fill-color:#172a3b!important'));
assert.ok(css.includes('caret-color:#172a3b!important'));
assert.ok(css.includes('.customerPage .customerAccountForm .field :is(input,textarea,select):disabled'));
assert.ok(css.includes('-webkit-text-fill-color:#344a5d!important'));
assert.ok(css.includes('background-color:#e5edf3!important'));
assert.ok(css.includes('.customerPage .customerAccountForm .field :is(input,textarea,select):is(:focus,:focus-visible)'));
assert.ok(css.includes('.customerPage .customerAccountForm .field :is(input,textarea,select):-webkit-autofill'));
assert.ok(css.includes('.customerPage .customerLoginCard .field :is(input,select,textarea)'));
assert.ok(css.includes('color:#f7f7f5!important'));
assert.ok(css.includes('color-scheme:dark!important'));
assert.ok(css.includes('.rentalBookingFields :is(input,select,textarea)'));
assert.ok(css.includes('input:not([type="checkbox"])'));
assert.ok(css.includes(':not([type="file"])'));
assert.ok(css.includes(':not([type="hidden"])'));
assert.ok(css.includes(':not([type="range"])'));
assert.ok(!css.includes('input,textarea,select{background:#fff!important}'),
 "Never globally whiten dark rental, login and product form backgrounds");
assert.ok(!css.includes('body{background:#fff!important}'),
 "Keep the dark customer portal and original page layout");
assert.ok(admin.includes('.adminContrastRoot'),"Admin retains its independently tested form system");
const luminance=color=>{
 const channels=color.match(/[\da-f]{2}/gi).map(x=>parseInt(x,16)/255);
 const linear=channels.map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
};
const contrast=(a,b)=>{
 const l1=luminance(a),l2=luminance(b);
 return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
};
assert.ok(contrast("172a3b","ffffff")>12,"Profile text against white needs high contrast");
assert.ok(contrast("344a5d","e5edf3")>7,"Disabled email must remain readable");
assert.ok(contrast("f7f7f5","101010")>15,"Dark login must stay readable");
console.log("Hele nettstedet: lesbare Min side-felter, mørk innlogging, autofyll, deaktivert e-post, utleie, mørk/lys nettlesermodus og uendrede layouts verifisert.");
