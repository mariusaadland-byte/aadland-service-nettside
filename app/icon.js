import {ImageResponse} from "next/og";

export const size={width:512,height:512};
export const contentType="image/png";

export default function Icon(){
 return new ImageResponse(
  <div style={{
   width:"100%",
   height:"100%",
   display:"flex",
   alignItems:"center",
   justifyContent:"center",
   background:"#111111",
   border:"24px solid #cfa153",
   color:"#cfa153",
   fontSize:"190px",
   fontWeight:700,
   fontFamily:"Arial, Helvetica, sans-serif",
   letterSpacing:"-12px"
  }}>
   AS
  </div>,
  {...size}
 );
}
