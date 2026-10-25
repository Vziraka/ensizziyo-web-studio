import {createHostedDesk} from '../hosted-desk.mjs';
import {refinementWorkerPath} from '../refinement-generation.mjs';

export const createRefinementBackground=(options={})=>(request,context)=>createHostedDesk({...options,env:{...(options.env??process.env),CONTEXT:context.deploy?.context??'',SITE_ID:context.site?.id??'',DEPLOY_ID:context.deploy?.id??''},backgroundOnly:refinementWorkerPath})(request,context);
export default createRefinementBackground();
export const config={path:'/desk/api/project-author/generate-execute',background:true};
