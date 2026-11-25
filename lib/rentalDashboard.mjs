export function rentalDashboardMoney(rows,count){
 if(!Array.isArray(rows)||!Number.isInteger(count)||count!==rows.length)return null;
 let captured=0,refunded=0,held=0,charged=0;
 for(const b of rows){
  const amounts=[b.payment_captured_ore,b.payment_refunded_ore,b.deposit_held_ore,b.deposit_charged_ore];
  if(!amounts.every(x=>Number.isSafeInteger(x)&&x>=0)||amounts[1]>amounts[0]||amounts[3]>amounts[2])return null;
  captured+=amounts[0];refunded+=amounts[1];held+=amounts[2];charged+=amounts[3];
 }
 if(![captured,refunded,held,charged].every(Number.isSafeInteger))return null;
 return {captured,refunded,net:captured-refunded,held,charged};
}
