export const storyIndex=progress=>Math.min(3,Math.max(0,Math.round(progress*3)));
export const storyOffset=(index,travel)=>Math.min(3,Math.max(0,index))/3*Math.max(0,travel);
