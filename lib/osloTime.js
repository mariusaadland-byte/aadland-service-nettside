const OSLO_TIME_ZONE="Europe/Oslo";

function dateParts(value){
 const date=value instanceof Date?value:new Date(value);
 if(Number.isNaN(date.getTime()))return null;
 const parts=new Intl.DateTimeFormat("en-GB",{
  timeZone:OSLO_TIME_ZONE,
  year:"numeric",month:"2-digit",day:"2-digit",
  hour:"2-digit",minute:"2-digit",second:"2-digit",
  hourCycle:"h23"
 }).formatToParts(date);
 const get=type=>Number(parts.find(part=>part.type===type)?.value);
 return {
  year:get("year"),month:get("month"),day:get("day"),
  hour:get("hour"),minute:get("minute"),second:get("second")
 };
}

function offsetMs(utcMs){
 const base=Math.floor(utcMs/1000)*1000;
 const p=dateParts(new Date(base));
 if(!p)return 0;
 return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-base;
}

function validDateInput(value){
 const input=String(value||"").trim();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input))return false;
 const [year,month,day]=input.split("-").map(Number);
 const check=new Date(Date.UTC(year,month-1,day,12));
 return check.getUTCFullYear()===year&&check.getUTCMonth()===month-1&&check.getUTCDate()===day;
}

function osloWallTimeIso(dateInput,endOfDay){
 if(!validDateInput(dateInput))return "";
 const [year,month,day]=dateInput.split("-").map(Number);
 const hour=endOfDay?23:0;
 const minute=endOfDay?59:0;
 const second=endOfDay?59:0;
 const millisecond=endOfDay?999:0;
 const wallUtc=Date.UTC(year,month-1,day,hour,minute,second,millisecond);
 let utc=wallUtc-offsetMs(wallUtc);
 const correctedOffset=offsetMs(utc);
 utc=wallUtc-correctedOffset;
 return new Date(utc).toISOString();
}

export function osloDayStartIso(value){
 return osloWallTimeIso(String(value||"").trim(),false);
}

export function osloDayEndIso(value){
 return osloWallTimeIso(String(value||"").trim(),true);
}

export function osloDateKey(value){
 if(!value)return "";
 const p=dateParts(value);
 if(!p)return "";
 return [p.year,String(p.month).padStart(2,"0"),String(p.day).padStart(2,"0")].join("-");
}

export function isValidDateInput(value){
 return validDateInput(value);
}


export function shiftDateKey(value,days){
 if(!validDateInput(value))return "";
 const [year,month,day]=String(value).split("-").map(Number);
 const date=new Date(Date.UTC(year,month-1,day,12));
 const amount=Number(days);
 if(!Number.isFinite(amount))return "";
 date.setUTCDate(date.getUTCDate()+Math.trunc(amount));
 return date.toISOString().slice(0,10);
}
