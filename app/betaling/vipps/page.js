import VippsReturnClient from "./VippsReturnClient";

export const metadata={
 title:"Vipps-betaling | Aadland Service",
 robots:{index:false,follow:false}
};

export default async function VippsReturnPage({searchParams}){
 const params=await searchParams;
 const unit=params?.unit==="rental"?"rental":"service";
 const reference=String(params?.reference||"");
 return <VippsReturnClient unit={unit} reference={reference}/>;
}
