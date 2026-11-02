import {AsyncLocalStorage} from 'node:async_hooks';
const guards=new AsyncLocalStorage();
export const withNativeTransportGuard=(guard,work)=>guards.run(guard,work);
export const checkNativeTransport=()=>guards.getStore()?.();
export const nativeGuardedFetch=async(input,options)=>{checkNativeTransport();const result=await fetch(input,options);checkNativeTransport();return result;};
