"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function ServicePage(){
 const {slug}=useParams();
 const [service,setService]=useState(null);
 const [loaded,setLoaded]=useState(false);

 useEffect(()=>{
  fetch("/api/services").then(r=>r.json()).then(data=>{
   setService((data.services||[]).find(item=>item.slug===slug)||null);
   setLoaded(true);
  }).catch(()=>setLoaded(true));
 },[slug]);

 if(!loaded)return <main style={{padding:"80px 24px"}}><p>Laster …</p></main>;
 if(!service)return <main style={{padding:"80px 24px"}}><h1>Tjenesten finnes ikke</h1><a href="/">Til forsiden</a></main>;

 return <main>
  <section className="serviceDetailHero" style={{minHeight:"70vh",display:"grid",alignItems:"end",position:"relative",overflow:"hidden",background:"#171717",color:"#fff"}}>
   {service.imageUrl&&<img src={service.imageUrl} alt={service.title} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",opacity:.45}}/>}
   <div style={{position:"relative",zIndex:1,maxWidth:1100,width:"100%",margin:"0 auto",padding:"120px 24px 70px"}}>
    <div className="kicker">AADLAND SERVICE</div>
    <h1 style={{fontSize:"clamp(42px,7vw,78px)",margin:"12px 0"}}>{service.title}</h1>
    <p style={{maxWidth:650,fontSize:20,lineHeight:1.6}}>{service.description}</p>
    <a className="btn" href={"/#befaring"} onClick={()=>sessionStorage.setItem("aadland-service",service.title)}>Be om befaring →</a>
   </div>
  </section>
 </main>;
}
