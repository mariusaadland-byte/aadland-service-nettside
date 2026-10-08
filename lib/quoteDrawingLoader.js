import "server-only";

export async function loadQuoteDrawings(database,quote){
 const ids=Array.isArray(quote?.drawing_ids)?[...new Set(quote.drawing_ids)]:[];
 if(!ids.length)return [];
 if(ids.length>8)throw new Error("Maks 8 tegninger kan legges ved ett tilbud.");
 const {data,error}=await database.from("project_drawings")
  .select("id,name,customer,address,drawing_data").in("id",ids);
 if(error)throw new Error("Kunne ikke hente tilhørende prosjekttegninger.");
 if((data||[]).length!==ids.length)throw new Error("En valgt tegning finnes ikke lenger. Åpne tilbudet og velg lagrede tegninger på nytt.");
 const byId=new Map(data.map(row=>[row.id,row]));
 return ids.map(id=>byId.get(id));
}
