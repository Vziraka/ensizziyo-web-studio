import {createHostedDesk} from '../hosted-desk.mjs';
import {researchWorkerPath} from '../known-identity-research.mjs';
export const createResearchBackground=(options={})=>(request,context)=>createHostedDesk({...options,env:{...(options.env??process.env),CONTEXT:context.deploy?.context??'',SITE_ID:context.site?.id??'',DEPLOY_ID:context.deploy?.id??''},backgroundOnly:researchWorkerPath})(request);
export default createResearchBackground();
export const config={path:'/desk/api/known-research/execute',background:true};
