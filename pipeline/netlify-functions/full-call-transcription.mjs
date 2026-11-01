import {createHostedDesk} from '../hosted-desk.mjs';

// The same protected handler runs behind the asynchronous platform wrapper; its response is discarded.
export const createFullCallBackground=(options={})=>(request,context)=>createHostedDesk({...options,env:{...(options.env??process.env),CONTEXT:context.deploy?.context??''},backgroundOnly:true})(request);
export default createFullCallBackground();
export const config={path:'/desk/api/full-call-transcription/execute',background:true};
