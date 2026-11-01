import {fixture as mailFixture} from './shared-operations-exact-mail.mjs';
import {conversationSchema} from '../conversation-records.mjs';
import {hash} from '../lifecycle.mjs';
export async function fixture(t,options={}){
 const {policyChange,importChange,...rest}=options;
 return mailFixture(t,{...rest,authorize:false,importChange(s){s.prospects['shared-proof'].controlled=true;importChange?.(s);},policyChange(p,s){
  p.conversation_records=conversationSchema;
  p.email_draft_tasks={version:1,mode:'fictional-existing-thread-v1',project_id:'shared-proof',thread_id:'thread',recovery_generation:'fictional-recovery-1'};
  p.mail.reply_bundle={version:1,mode:'exact-approved-task-reply-v1',project_id:'shared-proof',thread_id:'thread',max_attachments:2,max_pdf_bytes:512000};
  p.mail.schema={...p.mail.schema,version:3,reply_bundle:'exact-approved-task-reply-v1'};
  // Trusted fictional incoming baseline before installation; no mailbox or standing worker runs.
  const registered=p.routes,g={enabled:true,capability:'shared-registered-incoming-v1',run_id:s.run_id,grant_id:p.grant_id,account_email:p.account_email};s.operations.gmail_incoming={binding:hash({g,registered}),routes:structuredClone(registered),seen:{},phase:'history',index:registered.length,status:'Caught up',checked_at:s.updated_at,cursor:'103'};
  policyChange?.(p,s);
 }});
}
