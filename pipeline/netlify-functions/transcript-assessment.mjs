import {createHostedDesk} from '../hosted-desk.mjs';
import {assessmentWorkerPath} from '../hosted-assessment.mjs';

export const createAssessmentBackground=(options={})=>(request,context)=>createHostedDesk({...options,env:{...(options.env??process.env),CONTEXT:context.deploy?.context??''},backgroundOnly:assessmentWorkerPath})(request);
export default createAssessmentBackground();
export const config={path:'/desk/api/transcript-assessment/execute',background:true};
