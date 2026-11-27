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
try {
 const response = await fetch("https://apitest.vipps.no/accesstoken/get", {
  method: "POST",
  headers: { ...credentials, "Content-Type": "application/json" },
  redirect: "error",
  signal: AbortSignal.timeout(10000)
 });
 if (!response.ok) {
  await response.body?.cancel();
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
