import { publicConfig } from '@/lib/session';
export function GET() { return Response.json(publicConfig(process.env), { headers: { 'Cache-Control': 'no-store' } }); }
