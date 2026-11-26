// DOM-only helper for the private quote editor. Never changes quote/payment data.
export function bindQuoteDialogFocus(dialog,{isBusy,onClose}){
 const doc=dialog.ownerDocument;
 const previous=doc.activeElement;
 const focus=node=>{if(node&&typeof node.focus==="function")node.focus({preventScroll:true});};
 const controls=()=>Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')).filter(node=>node.tabIndex>=0&&!node.hidden&&node.getClientRects().length>0);
 const keydown=event=>{
  if(event.key==="Escape"){event.preventDefault();if(!isBusy())onClose();return;}
  if(event.key!=="Tab")return;
  const list=controls(),first=list[0],last=list[list.length-1],current=doc.activeElement;
  if(!first){event.preventDefault();focus(dialog);return;}
  if(!list.includes(current)||(event.shiftKey?current===first:current===last)){
   event.preventDefault();focus(event.shiftKey?last:first);
  }
 };
 const focusin=event=>{if(!dialog.contains(event.target))focus(controls()[0]||dialog);};
 doc.addEventListener("keydown",keydown);
 doc.addEventListener("focusin",focusin);
 // Start at the dialog itself, avoiding automatic mobile keyboard opening.
 focus(dialog);
 return ()=>{
  doc.removeEventListener("keydown",keydown);doc.removeEventListener("focusin",focusin);
  if(previous?.isConnected&&!previous.disabled)focus(previous);
 };
}
