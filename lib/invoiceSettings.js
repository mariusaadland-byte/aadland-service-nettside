// Standardverdier for fremtidig fakturamodul. Ikke utsted fakturaer uten kontroll av nummerserie og bokføringskrav.
export const INVOICE_BANK_ACCOUNT = "84504622699";
export const INVOICE_SENDER_EMAIL = "faktura@aadland-service.no";
export const INVOICE_PAYMENT_REFERENCE = invoiceNumber => String(invoiceNumber || "").trim();
export const INVOICE_EMAIL_TEMPLATE = ({customerName,invoiceNumber,projectTitle,amount,dueDate,paymentReference}) => [
  `Hei ${customerName || "kunde"}!`,
  "",
  "Takk for at du valgte Aadland Service.",
  "",
  `Vedlagt finner du faktura ${invoiceNumber} for ${projectTitle || "avtalt arbeid og leveranser"}.`,
  `Fakturabeløp: ${amount}`,
  `Forfallsdato: ${dueDate}`,
  `Kontonummer: 8450 46 22699`,
  `Betalingsreferanse: ${paymentReference || invoiceNumber}`,
  "",
  "Ta gjerne kontakt dersom du har spørsmål til fakturaen.",
  "",
  "Med vennlig hilsen",
  "Aadland Service",
  "faktura@aadland-service.no"
].join("\n");
