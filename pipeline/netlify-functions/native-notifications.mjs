import {createNativeNotificationGateway} from '../native-notification-gateway.mjs';
export default (request,context)=>createNativeNotificationGateway()(request,context);
export const config={path:'/desk-notifications/mcp'};
