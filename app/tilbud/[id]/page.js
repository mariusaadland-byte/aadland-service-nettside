import QuoteCustomerClient from "./QuoteCustomerClient";

export const metadata={
 title:"Tilbud",
 robots:{index:false,follow:false}
};

export default async function CustomerQuotePage({params}){
 const resolvedParams=await params;
 return <QuoteCustomerClient quoteId={resolvedParams.id}/>;
}
