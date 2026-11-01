import {createInternalDispatchWorker} from '../internal-dispatch-host.mjs';
export const createInternalDispatchBackground=(options={})=>(request,context)=>{
 const source=options.env??process.env,env={...source,CONTEXT:context.deploy?.context??'',SITE_ID:context.site?.id??'',DEPLOY_ID:context.deploy?.id??''};
 for(const key of ['EVZ_OPERATIONS_DESK_ENABLED','EVZ_INTERNAL_DISPATCH_RUNTIME','EVZ_INTERNAL_DISPATCH_BINDING','EVZ_OPERATIONS_BLOB_NAMESPACE','EVZ_OPERATIONS_ORIGIN','EVZ_INTERNAL_DISPATCH_SECRET'])Object.defineProperty(env,key,{enumerable:true,get:()=>source[key]});
 return createInternalDispatchWorker({...options,env})(request,context);
};
export default createInternalDispatchBackground();
export const config={background:true,path:'/desk/api/internal-dispatch-background'};
