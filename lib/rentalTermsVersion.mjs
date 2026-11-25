export const RENTAL_TERMS_VERSION="2026-11-25";
export const RENTAL_TERMS_PATH="/vilkar/utleie/"+RENTAL_TERMS_VERSION;
export function rentalTermsAccepted(input){
 return input?.acceptedTerms===true&&input?.termsVersion===RENTAL_TERMS_VERSION;
}
export function rentalTermsPath(version){
 return version===RENTAL_TERMS_VERSION?RENTAL_TERMS_PATH:null;
}
