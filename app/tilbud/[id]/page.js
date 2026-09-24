import QuoteCustomerClient from "./QuoteCustomerClient";

export const metadata={
 title:"Tilbud",
 robots:{index:false,follow:false}
};

export default async function CustomerQuotePage({params,searchParams}){
 const resolvedParams=await params;
 const resolvedSearch=await searchParams;
 return <QuoteCustomerClient quoteId={resolvedParams.id} token={String(resolvedSearch?.token||"")}/>;
}
