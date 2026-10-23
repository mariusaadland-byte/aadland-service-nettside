import "server-only";
import {vippsPaymentsEnabled,vippsPublicPaymentsEnabled} from "./vippsClient";
import {vippsUnitConfig} from "./vippsConfig";

function environment(){
 return String(process.env.VIPPS_ENV||"production").trim().toLowerCase()==="test"?"test":"production";
}

export async function vippsUnitReadiness(s,unit,{audience="public"}={}){
 const key=unit==="rental"?"rental":"service";
 const config=vippsUnitConfig(key);
 if(!vippsPaymentsEnabled(key))return {ready:false,reason:"disabled",config};
 // Admin-only direct-payment test must never silently expose public checkout.
 if(audience!=="admin"&&!vippsPublicPaymentsEnabled(key))return {ready:false,reason:"public-disabled",config};
 if(!config.configured)return {ready:false,reason:"config",config};
 if(!s)return {ready:false,reason:"database",config};

 const {data,error}=await s.rpc("get_vipps_webhook_status",{target_environment:environment()});
 if(error)return {ready:false,reason:"webhook-status",config,error};
 const webhook=(Array.isArray(data)?data:[]).find(item=>item?.unit===key&&item?.active!==false);
 if(!webhook)return {ready:false,reason:"webhook",config};
 return {ready:true,reason:"ready",config,webhook};
}
