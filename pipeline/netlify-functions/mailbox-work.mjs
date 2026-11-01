export default async function handler(request,context){
 if(process.env.EVZ_MAILBOX_WORK_GATEWAY!=='scoped-reply-worker-v1')return Response.json({error:'Worker gateway disabled'},{status:503,headers:{'Cache-Control':'no-store'}});
 if(!/^Bearer [a-f0-9]{64}$/.test(request.headers.get('authorization')??''))return Response.json({error:'Worker credential required'},{status:401,headers:{'Cache-Control':'no-store'}});
 const [{createMailboxWorkMcp},{openMailboxWorker}]=await Promise.all([import('../mailbox-work-mcp.mjs'),import('../mailbox-work-gateway.mjs')]);
 return createMailboxWorkMcp({openWorker:options=>openMailboxWorker(options)})(request,context);
}
export const config={path:'/desk-work/mcp'};
