// A browser-only navigation helper. Never proxy local printer traffic through
// our servers or accept external URLs as printer destinations.
export function vatWebscanLocalAddress(input){
 const host=String(input||"").trim();
 const segments=host.split(".");
 if(segments.length!==4||segments.some(segment=>!/^\d{1,3}$/.test(segment)))return "";
 const nums=segments.map(Number);
 if(nums.some(value=>value>255))return "";
 const [a,b]=nums;
 const privateIp=a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168);
 if(!privateIp)return "";
 if(nums[3]===0||nums[3]===255)return "";
 return "http://"+nums.join(".")+"/";
}
