// Trusted server adapter: build compare-and-swap arguments from a fresh stored challenge.
// Never use caller-supplied decisions, key IDs or MACs.
import {decideSigningAttempt} from "./aadlandSigningWorkflow.mjs";
export function signingCommitPlan(args){
 const {challenge,expected,keyId}=args;
 if(!challenge||!expected||typeof keyId!=="string"||!/^[a-zA-Z0-9_-]{1,64}$/.test(keyId))return null;
 const decision=decideSigningAttempt(args);
 if(!["record_failure","consume_and_record"].includes(decision.action))return {status:decision.action};
 return {status:"commit_required",params:{p_agreement:expected.agreementId,p_customer:expected.customerId,p_email:expected.email,p_id:challenge.challengeId,p_expected_mac:challenge.codeMac,p_expected_attempts:challenge.attempts,p_key:keyId,p_action:decision.action,p_evidence:decision.evidenceText??null,p_seal:decision.seal??null}};
}
