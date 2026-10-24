import {join} from 'node:path';
import {createHostedDesk} from '../../pipeline/hosted-desk.mjs';
export default (request,context)=>createHostedDesk({env:{...process.env,CONTEXT:context.deploy?.context??''},assetDirectory:join(process.cwd(),'pipeline','lifecycle-ui')})(request);
export const config={path:['/desk','/desk/*']};
