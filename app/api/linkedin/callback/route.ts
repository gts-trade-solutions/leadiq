import { NextRequest, NextResponse } from 'next/server';

/**
 * If you chose Approach A (recommended), your LinkedIn app redirects straight to the Supabase function,
 * so you don't need THIS route. If you prefer localhost in dev, keep this route and register:
 *   http://localhost:3000/api/linkedin/callback
 * as an authorized redirect URL in the LinkedIn portal.
 */

const SUPABASE_CALLBACK = 'https://gtbmrkgoiqbgkrznkrsa.supabase.co/linkedin-oauth-callback';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // If LinkedIn sent an OAuth error, bounce the user back to the UI (absolute URL!)
  const liError = searchParams.get('error');
  const liDesc  = searchParams.get('error_description') || '';
  if (liError) {
    const url = new URL('/campaigns', req.url); // absolute target
    url.searchParams.set('li_error', liError);
    if (liDesc) url.searchParams.set('li_error_description', liDesc);
    return NextResponse.redirect(url);
  }

  // Otherwise proxy to your Supabase Edge callback (recommended to keep logic server-side)
  const fnUrl = new URL(SUPABASE_CALLBACK);
  for (const [k, v] of searchParams.entries()) fnUrl.searchParams.set(k, v);

  const r = await fetch(fnUrl.toString(), { method: 'GET' });
  const html = await r.text();

  return new NextResponse(html, {
    status: r.status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
