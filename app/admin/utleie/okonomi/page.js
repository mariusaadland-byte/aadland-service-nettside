import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import {rentalFinanceEnabled,ownerRentalFinance} from "../../../../lib/rentalFinance";
import RentalFinancePanel from "../../../components/RentalFinancePanel";
import RentalReportPanel from "../../../components/RentalReportPanel";
import {rentalReportsEnabled} from "../../../../lib/rentalVippsReports";
import styles from "../oversikt/dashboard.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"Økonomi – Aadland Utleie",robots:{index:false,follow:false}};
export default async function Page(){const user=await getAdminUser();if(!user)redirect("/admin/login");if(user.role!=="owner")redirect("/admin");const enabled=rentalFinanceEnabled(),data=enabled?await ownerRentalFinance():null;return <main className={styles.root}><Link href="/admin/utleie/oversikt">← Utleieoversikt</Link>{enabled&&!data?<p role="alert" className={styles.warning}>Økonomigrunnlaget er ufullstendig, over 500 ordrer eller må kontrolleres. Ingen beløp vises.</p>:<RentalFinancePanel data={data} isDemo={!enabled}/>}<RentalReportPanel enabled={enabled&&rentalReportsEnabled()}/></main>;}
