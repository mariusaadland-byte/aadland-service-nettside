// Verify the existing preview credentials without logging them or creating a payment.
if (process.env.VERCEL_ENV !== "preview") {
 console.log("Vipps sandbox authentication skipped outside preview.");
 process.exit(0);
}
const configuredEnvironment = (process.env.VIPPS_ENVIRONMENT || "").trim().toLowerCase();
if (!["test", "mt", "apitest", "sandbox"].includes(configuredEnvironment)) {
 console.log("Vipps sandbox authentication skipped: preview is not labelled as a test environment.");
 process.exit(0);
}
const credentials = {
 client_id: (process.env.VIPPS_CLIENT_ID || "").trim(),
 client_secret: (process.env.VIPPS_CLIENT_SECRET || "").trim(),
 "Ocp-Apim-Subscription-Key": (process.env.VIPPS_SUBSCRIPTION_KEY || "").trim(),
 "Merchant-Serial-Number": (process.env.VIPPS_MSN || "").trim()
};
if (Object.values(credentials).some(value => !value)) {
 console.log("Vipps sandbox authentication skipped: preview credentials are incomplete.");
 process.exit(0);
}
const configuredMsn = credentials["Merchant-Serial-Number"];
if (!/^\d{4,10}$/.test(configuredMsn)) {
 const copiedNumber = configuredMsn.match(/^(?:MSN\s*[:=#-]?\s*)?["']?(\d{4,10})["']?$/i)?.[1];
 if (copiedNumber) {
  credentials["Merchant-Serial-Number"] = copiedNumber;
  console.log("Vipps sandbox authentication metadata: digits recovered from formatting.");
 } else {
  delete credentials["Merchant-Serial-Number"];
  console.log("Vipps sandbox authentication metadata: invalid MSN omitted from access-token request.");
 }
}
try {
 const response = await fetch("https://apitest.vipps.no/accesstoken/get", {
  method: "POST",
  headers: { ...credentials, "Content-Type": "application/json" },
  body: "",
  redirect: "error",
  signal: AbortSignal.timeout(10000)
 });
 if (!response.ok) {
  const error = await response.text();
  if (/AADSTS70001\b|AADSTS700016\b|unauthorized_client|application.+not found/i.test(error))
   console.log("Vipps sandbox authentication diagnosis: client was not recognized.");
  else if (/AADSTS7000215\b|invalid_client_secret|invalid client secret/i.test(error))
   console.log("Vipps sandbox authentication diagnosis: client secret was refused.");
  else if (/invalid subscription key|subscription not found/i.test(error))
   console.log("Vipps sandbox authentication diagnosis: subscription key was refused.");
  else if (!/^\d{4,10}$/.test(configuredMsn))
   console.log("Vipps sandbox authentication diagnosis: sales unit number has invalid format.");
  console.log("Vipps sandbox authentication rejected: HTTP " + response.status + ".");
 } else {
  const reply = await response.json();
  console.log(reply?.access_token
   ? "Vipps sandbox authentication verified."
   : "Vipps sandbox authentication uncertain: no access token returned.");
 }
} catch {
 console.log("Vipps sandbox authentication could not reach the test endpoint.");
}
