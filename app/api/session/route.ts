import { handleSession } from '@/lib/session';
export function POST(request: Request) { return handleSession(request, process.env); }
