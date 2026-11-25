import HomeClient from "./HomeClient";

export const metadata={
 alternates:{canonical:"/"}
};

const businessStructuredData={
 "@context":"https://schema.org",
 "@type":"LocalBusiness",
 name:"Aadland Service",
 url:"https://www.aadland-service.no",
 logo:"https://www.aadland-service.no/aadland-service-logo.webp",
 image:"https://www.aadland-service.no/opengraph-image",
 description:"Aadland Service hjelper privatkunder i Bergen og omegn med bygg, oppussing, vedlikehold, uteområder og produkter på bestilling.",
 telephone:"+4747154898",
 email:"post@aadland-service.no",
 vatID:"NO937781873MVA",
 areaServed:"Bergen og omegn"
};

export default function HomePage(){
 return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(businessStructuredData)}}/><HomeClient/></>;
}
