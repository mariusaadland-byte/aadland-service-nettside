// Read-only candidate matching. A Vipps payout-scheduled entry is NOT proof
// of a received bank credit. Even an exact amount/date match is a suggestion,
// not authorization to post or close anything in Tripletex.
const int=x=>typeof x==="number"&&Number.isSafeInteger(x);
const dateValue=x=>typeof x==="string"&&/^20\d\d-\d\d-\d\d$/.test(x)&&
 Number.isFinite(Date.parse(x+"T00:00:00Z"))&&
 new Date(x+"T00:00:00Z").toISOString().slice(0,10)===x;
export const BANK_MATCH_MAX_DAYS=31;
export const bankMatchDateSpan=(from,to)=>{
 if(!dateValue(from)||!dateValue(to)||from>to)return null;
 const days=Math.round((Date.parse(to+"T00:00:00Z")-
  Date.parse(from+"T00:00:00Z"))/86400000)+1;
 return days>=1&&days<=BANK_MATCH_MAX_DAYS?days:null;
};
export const decimalToOre=amount=>{
 if(typeof amount!=="number"||!Number.isFinite(amount)||
  Math.abs(amount)>90071992547409)return null;
 const raw=amount*100,ore=Math.round(raw);
 return Number.isSafeInteger(ore)&&Math.abs(raw-ore)<0.00001?ore:null;
};
const dateGap=(a,b)=>Math.round((Date.parse(b+"T00:00:00Z")-
 Date.parse(a+"T00:00:00Z"))/86400000);
const cleanDesc=desc=>String(desc||"").slice(0,255);
export function normalizeBankStatementTransactions(statements,transactions,accountId){
 if(!Array.isArray(statements)||!Array.isArray(transactions)||!int(accountId)||accountId<=0)
  throw Error("Bankkontoutskriften er ikke tilgjengelig i et gyldig format.");
 const ids=new Set();
 for(const statement of statements){
  // BankStatement's documented response does not have an accountId field.
  // Statements are selected through a server-side /bank/statement?accountId=
  // filter. Check the account only if this optional field is returned.
  const explicitAccount=statement?.accountId??statement?.account?.id;
  if(!int(Number(statement?.id))||Number(statement.id)<=0||
   (explicitAccount!=null&&Number(explicitAccount)!==accountId)||
   ids.has(Number(statement.id)))
   throw Error("Tripletex returnerte kontoutskrifter med uklar bankkonto.");
  ids.add(Number(statement.id));
 }
 const seen=new Set(),rows=[];
 for(const x of transactions){
  const statementId=Number(x?.bankStatement?.id??x?.bankStatementId);
  const id=Number(x?.id);
  const amountOre=decimalToOre(x?.amountCurrency);
  if(!int(id)||id<=0||seen.has(id)||!ids.has(statementId)||
   !dateValue(x?.postedDate)||amountOre===null)
   throw Error("Tripletex returnerte en banktransaksjon som må kontrolleres manuelt.");
  seen.add(id);
  rows.push({id,statementId,date:x.postedDate,
   amountOre,description:cleanDesc(x.description),
   // Tripletex may omit this protected field; null means unknown, not false.
   bankReconciled:typeof x.matched==="boolean"?x.matched:null});
 }
 return rows;
}
export function vippsBankCandidates(payouts,bankTransactions,{from,to}){
 if(!bankMatchDateSpan(from,to)||!Array.isArray(payouts)||!Array.isArray(bankTransactions))
  throw Error("Bankavstemmingsgrunnlaget er ikke komplett.");
 const selected=payouts.filter(p=>p.date>=from&&p.date<=to);
 const payoutKeys=new Set();
 for(const p of selected){
  const key=p.date+"|"+p.pspReference;
  if(!dateValue(p.date)||!int(p.amountOre)||p.amountOre<=0||
   typeof p.pspReference!=="string"||!p.pspReference||
   payoutKeys.has(key))
   throw Error("Vipps-utbetalingene inneholder tvetydige eller ugyldige poster.");
  payoutKeys.add(key);
 }
 const seenBank=new Set();
 for(const b of bankTransactions){
  if(!int(b.id)||b.id<=0||seenBank.has(b.id)||!dateValue(b.date)||
   !int(b.amountOre))throw Error("Banktransaksjonene er ufullstendige.");
  seenBank.add(b.id);
 }
 const candidateLists=selected.map(p=>bankTransactions.filter(b=>
  b.amountOre===p.amountOre&&dateGap(p.date,b.date)>=-1&&
  dateGap(p.date,b.date)<=7));
 const sharedCounts=new Map();
 for(const matches of candidateLists)for(const b of matches)
  sharedCounts.set(b.id,(sharedCounts.get(b.id)||0)+1);
 return selected.map((p,i)=>{
  const matches=candidateLists[i];
  const unique=matches.length===1&&!((sharedCounts.get(matches[0].id)||0)>1);
  const b=unique?matches[0]:null;
  const strong=Boolean(b&&(
   b.description.toLowerCase().includes("vipps")||
   b.description.toLowerCase().includes(String(p.pspReference).toLowerCase())));
  const reconciled=Boolean(b&&b.bankReconciled===true);
  const previouslyReconciledCount=matches.filter(x=>x.bankReconciled===true).length;
  return {date:p.date,reference:p.pspReference,amountOre:p.amountOre,
   transferStatus:p.transferStatus||"not_transferred",
   status:matches.length===0?"not_found":
    !unique?"ambiguous":reconciled?"possible_already_reconciled":
    strong?"possible_with_reference":"possible_amount_date",
   candidateCount:matches.length,
   previouslyReconciledCount,
   candidate:b?{id:b.id,date:b.date,amountOre:b.amountOre,
    bankReconciled:b.bankReconciled??null,
    description:b.description}:null};
 });
}

/** A statement's toDate is exclusive. Never infer full bank-data coverage
    from a single day of transactions or a search that returned no statements. */
export function bankStatementCoverage(statements,start,endExclusive){
 if(!Array.isArray(statements)||!dateValue(start)||!dateValue(endExclusive)||
  start>=endExclusive)return "missing";
 const days=Math.round((Date.parse(endExclusive+"T00:00:00Z")-
  Date.parse(start+"T00:00:00Z"))/86400000);
 if(days>60)return "missing";
 let covered=0;
 for(let offset=0;offset<days;offset++){
  const day=new Date(Date.parse(start+"T00:00:00Z")+offset*86400000)
   .toISOString().slice(0,10);
  if(statements.some(x=>dateValue(x?.fromDate)&&dateValue(x?.toDate)&&
   x.fromDate<=day&&x.toDate>day))covered++;
 }
 return covered===days?"complete":covered===0?"missing":"partial";
}

/** Human review queue. Bank candidate matching never authorizes posting. */
export function vippsBankReviewTasks(matches){
 if(!Array.isArray(matches))throw Error("Bankmatchlisten mangler.");
 const messages={
  possible_already_reconciled:"Banktransaksjonen er allerede matchet i Tripletex. Kontroller bilaget den er koblet til før en eventuell ny oppgjørsføring.",
  ambiguous:"Flere utbetalinger eller banktransaksjoner kan passe sammen. Kontroller bankreferanse og dato manuelt.",
  no_statement_coverage:"Det finnes ingen kontoutskrift for hele sammenligningsvinduet. Kontroller bankintegrasjonen i Tripletex.",
  partial_statement_coverage:"Kontoutskriften er ufullstendig for sammenligningsvinduet. Kontroller de manglende bankdagene.",
  not_found:"Ingen innbetaling med samme beløp er funnet innenfor et dekket bankvindu. Kontroller mottakskonto og om utbetalingen er gjennomført.",
  possible_amount_date:"Beløp og dato passer, men bankteksten bekrefter ikke Vipps. Kontroller at dette faktisk er riktig innbetaling.",
  possible_with_reference:"Mulig Vipps-treff i banken. Kontroller referansen og bokføringsstatus før du godkjenner noe."
 };
 const risk={
  possible_already_reconciled:0,ambiguous:1,no_statement_coverage:2,
  partial_statement_coverage:2,not_found:3,possible_amount_date:4,
  possible_with_reference:5
 };
 return matches.map(item=>{
  if(!dateValue(item?.date)||!int(item.amountOre)||item.amountOre<=0||
   typeof item.reference!=="string"||!messages[item.status])
   throw Error("Bankmatchlisten har ufullstendige opplysninger.");
  const uncertain=item.transferStatus==="processing"||item.transferStatus==="needs_review";
  const partlyMatched=item.previouslyReconciledCount>0&&item.status==="ambiguous";
  return {date:item.date,reference:item.reference,amountOre:item.amountOre,
   priority:uncertain?-1:partlyMatched?0:risk[item.status],
   message:(uncertain?"Oppgjørsbilaget har usikker overføringsstatus i Tripletex. Stopp og kontroller om bilaget finnes. ":
    partlyMatched?"Minst én mulig banktransaksjon er allerede avstemt. ":"")+
    messages[item.status],
   status:item.status};
 }).sort((a,b)=>a.priority-b.priority||a.date.localeCompare(b.date)||
  a.reference.localeCompare(b.reference));
}
