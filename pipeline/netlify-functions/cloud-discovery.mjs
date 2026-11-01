export default async function handler(request,context){
 if(process.env.EVZ_DISCOVERY_GATEWAY!=='bounded-public-research-v1')return Response.json({error:'Discovery gateway disabled'},{status:503,headers:{'Cache-Control':'no-store'}});
 if(!/^Bearer [a-f0-9]{64}$/.test(request.headers.get('authorization')??''))return Response.json({error:'Discovery credential required'},{status:401,headers:{'Cache-Control':'no-store'}});
 const [{createCloudDiscoveryMcp},{openCloudDiscoveryWorker}]=await Promise.all([import('../cloud-discovery-mcp.mjs'),import('../cloud-discovery-gateway.mjs')]);
 return createCloudDiscoveryMcp({openWorker:options=>openCloudDiscoveryWorker(options)})(request,context);
}
export const config={path:'/desk-discovery/mcp'};
