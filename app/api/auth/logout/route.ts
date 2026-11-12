import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LOGOUT_FLAG_COOKIE, STAFF_SESSION_COOKIE } from '@/lib/auth/session';

export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut().catch(() => {});
  } catch {
    // ignore supabase signout errors
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete(STAFF_SESSION_COOKIE);
  response.cookies.set(LOGOUT_FLAG_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
