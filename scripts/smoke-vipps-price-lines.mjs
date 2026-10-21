import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('lib/vippsPriceLines.js','utf8').replace(/export /g,'');
const {total,adjust,eligible,hasEligible}=new Function(source+';return {total:customerTotalOre,adjust:linesForCustomerTotal,eligible:canAdjustVippsPriceLine,hasEligible:hasAdjustableVippsPriceLine};')();
const lines=[
 {id:'m',type:'material',description:'Material',quantity:2,unit:'stk',unitPriceOre:10000,vatRate:25,internalUnitCostOre:5000},
 {id:'w',type:'work',description:'Tømrerarbeid',quantity:1,unit:'time',unitPriceOre:60000,vatRate:25}
];
assert.equal(total(lines),100000);
const changed=adjust(lines,103185);
assert.ok(changed.totalOre>=103185);
assert.ok(changed.totalOre-103185<=2);
assert.equal(changed.adjustedLineIndex,0,'Material is selected for the uplift');
assert.equal(changed.lineItems[1].unitPriceOre,60000,'Hourly work price MUST NOT change');
assert.ok(changed.lineItems[0].unitPriceOre>10000,'Only materials are marked up');
assert.equal(changed.lineItems[0].internalUnitCostOre,5000,'Private cost unchanged');
assert.equal(total(lines),100000,'No mutation');
const again=adjust(changed.lineItems,103185);
assert.equal(again.totalOre,changed.totalOre,'Repeated apply does not add a second uplift');
assert.equal(again.lineItems[1].unitPriceOre,60000);
const hourlyOnly=[{id:'w',type:'work',description:'Timearbeid',quantity:5,unit:'time',unitPriceOre:65000,vatRate:25}];
assert.equal(hasEligible(hourlyOnly),false,'Hourly-only invoice must not offer markup');
assert.equal(adjust(hourlyOnly,430000),null,'Hourly-only invoice must not be grossed up');
assert.equal(adjust([hourlyOnly[0],{...hourlyOnly[0],id:'w2',type:'other'}],440000),null,'Other hourly unit must not be grossed up');
const miscellaneous=[hourlyOnly[0],{id:'f',type:'other',description:'Frakt',quantity:1,unit:'stk',unitPriceOre:10000,vatRate:25}];
const otherTotal=total(miscellaneous);
const other=adjust(miscellaneous,otherTotal+1000);
assert.ok(other.totalOre>=otherTotal+1000);
assert.equal(other.adjustedLineIndex,1,'Other non-labor cost can be marked up');
assert.equal(other.lineItems[0].unitPriceOre,hourlyOnly[0].unitPriceOre,'Hour price unchanged when other costs exist');
assert.equal(eligible({description:'Materialer og festemidler',unit:'stk',unitPriceOre:1,vatRate:25,quantity:1}),true,'Recognise untyped material in old invoice drafts');
assert.equal(eligible({description:'Arbeid og materialer',unit:'stk',unitPriceOre:1,vatRate:25,quantity:1}),false,'Do not mark up combined work lines');
assert.equal(eligible({type:'other',description:'Montering',unit:'stk'}),false,'Other-labelled labor is still protected');
assert.equal(eligible({type:'material',description:'Materialer',unit:'timer'}),false,'Any hourly unit is protected');
assert.equal(adjust([],1000),null);
assert.equal(adjust([{type:'work',quantity:1,unitPriceOre:'',vatRate:25}],1000),null);
assert.equal(adjust(lines,1).totalOre,100000,'Do not reduce line price when requested payout is below current price');
console.log('Vipps material-only pricing passed: unchanged hourly rate, material markup, other expenses, mixed/old invoice lines, VAT and idempotence.');
