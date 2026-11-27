import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import {groupAdminEnabled,groupAdminOrders} from "../../../../lib/groupAdminOrders";
import GroupAdminPanel from "../../../components/GroupAdminPanel";
export const dynamic="force-dynamic";
export const metadata={title:"Samlede utleieordrer",robots:{index:false,follow:false}};
export default async function Page(){const user=await getAdminUser();if(!user)redirect("/admin/login");if(user.role!=="owner")redirect("/admin");const enabled=groupAdminEnabled(),data=enabled?await groupAdminOrders():null;return <main style={{maxWidth:1000,margin:"auto",padding:16}}><Link href="/admin/utleie/oversikt">← Utleieoversikt</Link><p><Link className="btn alt" href="/admin/utleie/ordrer/oppfolging">Betalinger til oppfølging</Link></p>{enabled&&!data.ok?<p role="alert">Ordregrunnlaget er ufullstendig eller over visningsgrensen. Ingen tall vises før kontroll.</p>:<GroupAdminPanel demo={!enabled} rows={data?.rows||[]} actionsEnabled={enabled&&process.env.AADLAND_GROUP_ADMIN_ACTIONS_ENABLED==="true"}/>}</main>;}
