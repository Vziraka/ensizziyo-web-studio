export function centsFromDollars(value) {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(String(value).trim());
  if (!match) throw Error('Enter USD dollars with at most two decimal places, such as 1200.00');
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}
