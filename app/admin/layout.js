import "./adminContrast.css";
import "./tilbud/quoteEditorResponsive.css";
export const metadata={
 robots:{index:false,follow:false},
 title:{default:"Aadland Admin",template:"%s | Aadland Admin"},
 manifest:"/admin/manifest.webmanifest",
 appleWebApp:{capable:true,title:"Aadland Admin",statusBarStyle:"black-translucent"},
 icons:{icon:"/admin/icon",apple:"/admin/apple-icon"}
};
export const viewport={colorScheme:"light",themeColor:"#f3f6f9"};
export default function AdminLayout({children}){
 return <div className="adminContrastRoot">{children}</div>;
}
