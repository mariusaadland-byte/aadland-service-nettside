// Project drawing permissions are distinct from order VIEW permission.
// These helpers accept the already authenticated, server-verified admin user.
export function canReadProjectDrawings(user){
 return Boolean(user&&user.active!==false&&(
  user.role==="owner"||
  user.canViewOrders===true||
  user.canUpdateOrders===true||
  user.canManageProducts===true
 ));
}
export function canEditProjectDrawings(user){
 return Boolean(user&&user.active!==false&&(
  user.role==="owner"||
  user.canUpdateOrders===true||
  user.canManageProducts===true
 ));
}
