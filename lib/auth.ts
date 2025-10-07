import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export function getAuthClient() {
  return createRouteHandlerClient({ cookies });
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}

export async function requireUser() {
  const supabase = getAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new HttpError(401, "Not signed in");
  return user;
}
