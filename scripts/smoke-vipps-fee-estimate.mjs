import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('lib/vippsFeeEstimate.js','utf8').replace(/export /g,'');
const {fee,price}=new Function(source+';return {fee:vippsFeeEstimate,price:vippsPriceForPayout};')();
assert.deepEqual(fee(100000),{amountOre:100000,feeOre:3090,payoutOre:96910});
assert.deepEqual(fee(0),{amountOre:0,feeOre:0,payoutOre:0});
assert.equal(fee(-1),null);assert.equal(fee(NaN),null);assert.equal(fee(1.5),null);assert.equal(fee(100,{rateBps:10000}),null);
for(const terms of [{},{rateBps:0,fixedOre:0},{rateBps:0,fixedOre:100},{rateBps:175,fixedOre:0},{rateBps:9999,fixedOre:100}]){
 for(const target of [1,100,1000,99999,100000,1000000]){
  const result=price(target,terms);if(!result){assert.ok(fee(10_000_000_000,terms).payoutOre<target);continue;}assert.ok(result.payoutOre>=target);assert.ok(fee(result.amountOre-1,terms).payoutOre<target,'Price is minimal after øre rounding');
 }
}
assert.equal(price(0),null);assert.equal(price(Infinity),null);assert.equal(price(100,{rateBps:10000}),null);
assert.equal(fee(200000).feeOre,6080,'Fixed fee applies once to the whole booking');
assert.notEqual(fee(200000).feeOre,fee(100000).feeOre*2);
console.log('Vipps-prisberegning bestått: gebyr, anslått utbetaling, ønsket utbetaling, avrunding og ett fastgebyr per betaling.');
