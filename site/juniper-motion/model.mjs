export function endTime(start){const [h,m]=start.split(':').map(Number),total=h*60+m+90;if(!Number.isFinite(total)||total>17*60)throw Error('Seating must end by 5:00 PM.');return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`}
export function available(date,guests){return date==='2026-10-17'&&guests>=1&&guests<=6?['09:30','10:00','10:30','11:30']:[]}
