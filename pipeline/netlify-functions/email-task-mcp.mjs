import {createEmailTaskMcp} from '../email-task-mcp.mjs';
import {openFictionalEmailTaskAuthority} from '../shared-email-draft-tasks.mjs';
export default (request,context)=>createEmailTaskMcp({openAuthority:openFictionalEmailTaskAuthority,env:{...process.env,CONTEXT:context.deploy?.context??'',SITE_ID:context.site?.id??'',DEPLOY_ID:context.deploy?.id??''}})(request,context);
export const config={path:'/desk-email-task/*'};
