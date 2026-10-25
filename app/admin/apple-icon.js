import {ImageResponse} from "next/og";
export const size={width:180,height:180};
export const contentType="image/png";
export default function AdminAppleIcon(){
 return new ImageResponse(
  <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",
   justifyContent:"center",background:"#121921",color:"#f4d19b",
   border:"9px solid #bd8a45",borderRadius:30,
   fontSize:62,fontWeight:800,fontFamily:"Arial, Helvetica, sans-serif"}}>AS</div>,
  {...size}
 );
}
