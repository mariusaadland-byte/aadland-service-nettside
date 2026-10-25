import {ImageResponse} from "next/og";
export const size={width:512,height:512};
export const contentType="image/png";
export default function AdminIcon(){
 return new ImageResponse(
  <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",
   justifyContent:"center",background:"#121921",color:"#f4d19b",
   border:"26px solid #bd8a45",borderRadius:100,
   fontSize:167,fontWeight:800,fontFamily:"Arial, Helvetica, sans-serif",
   letterSpacing:"-9px"}}>AS</div>,{...size}
 );
}
