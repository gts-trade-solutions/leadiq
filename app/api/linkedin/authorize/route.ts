import { NextResponse } from 'next/server';

const AUTHZ = 'https://www.linkedin.com/oauth/v2/authorization';
const SCOPES = ['w_member_social','w_organization_social','r_organization_social']; // trim if only personal

export async function GET() {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
    scope: SCOPES.join(' '),
    state: crypto.randomUUID(), // store in cookie if you want CSRF check
  });
  return NextResponse.redirect(`${AUTHZ}?${params.toString()}`);
}
