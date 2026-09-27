import {ImageResponse} from "next/og";

export const alt="Aadland Service – bygg, oppussing og uteområder i Bergen";
export const size={width:1200,height:630};
export const contentType="image/png";

export default function Image(){
 return new ImageResponse(
  <div
   style={{
    width:"100%",
    height:"100%",
    display:"flex",
    flexDirection:"column",
    justifyContent:"space-between",
    background:"#111111",
    color:"#f4efe6",
    padding:"72px 82px",
    fontFamily:"Arial, Helvetica, sans-serif"
   }}
  >
   <div style={{display:"flex",alignItems:"center",gap:"20px"}}>
    <div
     style={{
      width:"74px",
      height:"74px",
      border:"2px solid #c9a45d",
      borderRadius:"50%",
      display:"flex",
      alignItems:"center",
      justifyContent:"center",
      color:"#c9a45d",
      fontSize:"29px",
      fontWeight:700,
      letterSpacing:"2px"
     }}
    >
     AS
    </div>
    <div style={{display:"flex",flexDirection:"column"}}>
     <div style={{fontSize:"24px",letterSpacing:"5px",color:"#c9a45d"}}>AADLAND SERVICE</div>
     <div style={{fontSize:"18px",marginTop:"8px",color:"#bdb6aa"}}>BERGEN OG OMEGN</div>
    </div>
   </div>

   <div style={{display:"flex",flexDirection:"column",maxWidth:"960px"}}>
    <div style={{fontSize:"70px",fontWeight:700,lineHeight:1.02,letterSpacing:"-2px"}}>
     Kvalitet som varer.
    </div>
    <div style={{fontSize:"31px",lineHeight:1.35,marginTop:"24px",color:"#d9d2c8"}}>
     Bygg · oppussing · vedlikehold · uteområder
    </div>
   </div>

   <div style={{display:"flex",justifyContent:"space-between",fontSize:"20px",color:"#9f988e"}}>
    <div>aadland-service.no</div>
    <div>471 54 898</div>
   </div>
  </div>,
  {...size}
 );
}