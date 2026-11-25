export const RENTAL_CATALOG_PAGE_SIZE=12;
const normalize=value=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("nb-NO").replace(/ø/g,"o").replace(/æ/g,"ae").trim();

export function rentalCatalogCategory(item,categories){
 return categories.some(category=>category.id===item.categoryId)?item.categoryId:"uncategorized";
}

export function filterRentalCatalog(items,categories,{category="all",query="",sort="recommended"}={}){
 const names=new Map(categories.map(c=>[c.id,c.name]));
 const tokens=normalize(query).split(/\s+/).filter(Boolean);
 let result=items.filter(item=>{
  if(category!=="all"&&rentalCatalogCategory(item,categories)!==category)return false;
  const haystack=normalize([item.name,item.description,item.categoryName,names.get(item.categoryId)].filter(Boolean).join(" "));
  return tokens.every(token=>haystack.includes(token));
 });
 if(sort==="price-asc"||sort==="price-desc"){
  const direction=sort==="price-asc"?1:-1;
  return result.slice().sort((a,b)=>direction*(Number(a.dailyPriceOre)-Number(b.dailyPriceOre))||String(a.name).localeCompare(String(b.name),"nb"));
 }
 if(sort==="name")return result.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),"nb"));
 if(category!=="all"||tokens.length)return result;
 const groups=[...categories.map(c=>result.filter(item=>item.categoryId===c.id)),result.filter(item=>!names.has(item.categoryId))];
 const mixed=[];
 for(let i=0;groups.some(group=>i<group.length);i++){
  for(const group of groups)if(i<group.length)mixed.push(group[i]);
 }
 return mixed;
}
