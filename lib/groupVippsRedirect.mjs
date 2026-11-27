// Exact provider host; preserve original URL and never open in iframe.
export function groupVippsRedirect(value){
 if(typeof value!=="string"||value.length>8192||/[\x00-\x20\x7f]/.test(value))return null;
 try{const u=new URL(value);return u.protocol==="https:"&&u.hostname==="landing.vipps.no"&&!u.username&&!u.password&&!u.port&&!u.hash?value:null;}catch{return null;}
}
