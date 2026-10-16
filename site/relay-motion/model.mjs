export function postcodes(value){const values=value.split(',').map(v=>v.trim()).filter(Boolean);if(!values.length||values.some(v=>!/^\d{5}$/.test(v)))throw Error('Use five digits for each postcode.');return [...new Set(values)]}
export function outcome(flow,negative,rule){if(flow==='service')return rule.codes.includes(negative?'99999':'22030');if(flow==='quote')return (negative?3:8)>=rule.days;return (negative?44:20)>0&&(negative?44:20)<=rule.hours}
export function runEvents(flow,eligible){return eligible?[0,1.1,2.4,6.8,10]:[0,1.1,2.4,6]}
