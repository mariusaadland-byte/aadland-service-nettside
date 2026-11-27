import {agreementDocumentDigest,issueSigningChallenge,signingConsent,sealSigningEvidence} from "../lib/aadlandSigning.mjs";
export function demoSignedRental({id,customerId,now,group}){
 const agreementId="00000000-0000-4000-8000-000000000009",bytes=Buffer.from("%PDF-1.4\nDemo only\n"),key=Buffer.alloc(32,7),quoteDigest="a".repeat(64),termsVersion="2026-11-25";
 const agreement={id:agreementId,group_id:id,customer_user_id:customerId,revision:1,created_at:now,document_bytes:bytes,document_digest:agreementDocumentDigest(bytes),quote_digest:quoteDigest,terms_version:termsVersion};
 const expected={agreementId,customerId,email:"demo@example.invalid",documentDigest:agreement.document_digest,quoteDigest,termsVersion};
 const {challenge}=issueSigningChallenge({...expected,now,key});
 const consent=signingConsent({...expected,name:"Demo Kunde",accepted:true,paymentObligation:true},expected);
 const sealed=sealSigningEvidence({expected,challenge:{...challenge,state:"consumed"},consent,verifiedAt:now,key});
 return {group:{...group,quote_digest:quoteDigest,terms_version:termsVersion},agreement,pointer:{group_id:id,agreement_id:agreementId},record:{agreement_id:agreementId,challenge_id:challenge.challengeId,evidence_text:JSON.stringify(sealed.evidence),evidence_seal:sealed.seal,signed_at:now},key};
}
