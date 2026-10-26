import {hash} from './lifecycle.mjs';
export const bookingContext=r=>hash({contact:r.contact,reply:r.reply??null,discovery:r.discovery??null,calls:r.calls,owner:r.follow_up_owner??null});
export const bookingKey=input=>`meeting-${hash({prospect_id:input.prospect_id,start:input.start,end:input.end,attendee:input.attendee_email}).slice(0,32)}`;
export const bookingConfirmations=(state,config)=>['shared-operations-calendar-v1','shared-operations-exact-mail-v1','shared-operations-pdf-mail-v1'].includes(config.shared_capability)?Object.fromEntries(Object.entries(state.operations?.bookings??{}).filter(([,b])=>b.confirmation).map(([id,b])=>[id,b.confirmation])):config.operations?.bookings??{};
