"use client";

export default function GlobalError({reset}){
 return <html lang="nb">
  <body style={{margin:0,background:"#111",color:"#f4efe6",fontFamily:"Arial,Helvetica,sans-serif"}}>
   <main style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"28px"}}>
    <section style={{width:"100%",maxWidth:"620px",background:"#181818",border:"1px solid #39342c",padding:"44px 34px",textAlign:"center",boxShadow:"0 24px 80px rgba(0,0,0,.28)"}}>
     <div style={{width:"76px",height:"76px",margin:"0 auto 22px",border:"2px solid #cfa153",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",color:"#cfa153",fontSize:"27px",fontWeight:800,letterSpacing:"1px"}} aria-hidden="true">AS</div>
     <div style={{color:"#cfa153",fontSize:"11px",fontWeight:800,letterSpacing:".14em"}}>NOE GIKK GALT</div>
     <h1 style={{fontSize:"34px",lineHeight:1.05,margin:"12px 0 14px"}}>Nettsiden kunne ikke lastes</h1>
     <p style={{color:"#c9c3b8",lineHeight:1.6,margin:"0 auto 26px",maxWidth:"470px"}}>Prøv å laste siden på nytt. Hvis problemet fortsetter, kan du gå tilbake til forsiden.</p>
     <div style={{display:"flex",gap:"10px",justifyContent:"center",flexWrap:"wrap"}}>
      <button type="button" onClick={()=>reset()} style={{border:0,background:"#cfa153",color:"#111",fontWeight:800,padding:"13px 19px",cursor:"pointer"}}>Prøv igjen</button>
      <a href="/" style={{border:"1px solid #cfa153",color:"#cfa153",fontWeight:800,padding:"12px 19px",textDecoration:"none"}}>Til forsiden</a>
     </div>
    </section>
   </main>
  </body>
 </html>;
}
