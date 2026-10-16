export const flavors = [
  {id:'orange',name:'Orange + Rosemary',description:'Orange brightness. A rosemary finish.',image:'orange-rosemary.webp',alt:'Orange Sola bottle with rosemary',ingredients:['Orange','Rosemary'],notes:['Bright, rounded citrus.','A fragrant herbal finish.'],story:['Orange brings the brightness.','Rosemary brings the twist.'],color:'#f54b07'},
  {id:'lime',name:'Lime + Basil',description:'Lime brightness. A basil finish.',image:'lime-basil.webp',alt:'Green Sola bottle with basil',ingredients:['Lime','Basil'],notes:['Bright, zesty citrus.','A fresh botanical finish.'],story:['Lime brings the brightness.','Basil brings the twist.'],color:'#355c36'},
  {id:'berry',name:'Berry + Hibiscus',description:'Berry brightness. A hibiscus finish.',image:'berry-hibiscus.webp',alt:'Red Sola bottle with hibiscus',ingredients:['Berry','Hibiscus'],notes:['Rounded berry flavor.','A floral botanical finish.'],story:['Berry brings the brightness.','Hibiscus brings the twist.'],color:'#9a243d'}
];
export const wrap = n => ((n % flavors.length) + flavors.length) % flavors.length;
// A periodic sway stays continuous as the flavor rail loops in either direction.
export const sunRotation = position => 3*Math.sin((position-1)*2*Math.PI/3);
export const railDelta = (slot,position,count=9) => ((slot-position+count/2)%count+count)%count-count/2;
export const headingFor = index => ['orange-heading.webp','lime-heading-v2.webp','berry-heading-v2.webp'][wrap(index)];
export function settledPosition(target,start){const nearest=Math.round(target);return nearest===start&&Math.abs(target-start)>.08?start+Math.sign(target-start):nearest;}
export function route(hash) {
  const id = /^#flavor\/(orange|lime|berry)$/.exec(hash)?.[1];
  return id ? {view:'detail',index:flavors.findIndex(f=>f.id===id)} : {view:'collection'};
}
export function pose(index,position,width,height) {
  const delta=railDelta(index,position),distance=Math.abs(delta);
  return {x:delta*width*.34,y:height*(.04+.04*Math.min(distance,3)**2+Math.sin(delta*1.2)*.08),scale:Math.max(.45,1-distance*.1275),rotate:Math.sin(delta*1.6)**2*11,z:Math.round(20-distance*3),opacity:1,yaw:Math.max(-14,Math.min(14,-delta*6))};
}
