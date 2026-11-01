export function outreachFooter(address){
 return typeof address==='string'&&address.trim()?`EVZ Digital team\n${address.trim()}\nTo stop these emails, reply STOP.`:null;
}
