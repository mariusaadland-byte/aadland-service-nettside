import RentalGuestPaymentClient from "./RentalGuestPaymentClient";

export const metadata={
 title:"Betal utleie | Aadland Utleie",
 robots:{index:false,follow:false},
 referrer:"no-referrer"
};

export default async function RentalGuestPaymentPage({searchParams}){
 const params=await searchParams;
 const booking=String(params?.booking||"");
 return <RentalGuestPaymentClient bookingId={booking}/>;
}
