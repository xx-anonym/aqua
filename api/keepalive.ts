// Vercel cron target (see "crons" in vercel.json): keeps the Supabase free-plan project
// active, which would otherwise be paused after a week without database activity.
// Uses only the public anon key; the RPC is callable with that key anyway.

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://kkppnegmlvplxpvcuhkn.supabase.co';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrcHBuZWdtbHZwbHhwdmN1aGtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNzk4ODMsImV4cCI6MjEwODk1NTg4M30.kpNBygltK3wNf7Vwf1TGjKJyxgFvLVRvkLN0fYeubro';

const headers = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' };

export async function GET(): Promise<Response> {
  try {
    // Two database requests per run: a write via RPC and a plain read through the REST API.
    const ping = await fetch(`${SUPABASE_URL}/rest/v1/rpc/keepalive`, { method: 'POST', headers, body: '{}' });
    const read = await fetch(`${SUPABASE_URL}/rest/v1/dive_site?select=id&limit=1`, { headers });
    const pingedAt = ping.ok ? await ping.json() : null;
    const ok = ping.ok && read.ok;
    return Response.json({ ok, pinged_at: pingedAt, status: [ping.status, read.status] }, { status: ok ? 200 : 502 });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
