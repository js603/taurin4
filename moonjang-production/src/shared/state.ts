import { api } from "./api";
import { localDb } from "./localDb";
import type { Session } from "../domain";

export const SESSION_KEY = "session";
export const API_KEY = "apiBase";
export const DRAFT_KEY = "draftLocal";

export async function restoreRuntime() {
  const apiBase = await localDb.get<string>(API_KEY);
  const session = await localDb.get<Session>(SESSION_KEY);
  api.configure(apiBase || api.getBase(), session?.token || "");
  return { apiBase: apiBase || api.getBase(), session };
}

export async function persistSession(session: Session | null) {
  if (!session) {
    await localDb.remove(SESSION_KEY);
    api.configure(api.getBase(), "");
    return;
  }
  await localDb.set(SESSION_KEY, session);
  api.configure(api.getBase(), session.token);
}

export async function persistApiBase(base: string) {
  await localDb.set(API_KEY, base);
  const session = await localDb.get<Session>(SESSION_KEY);
  api.configure(base, session?.token || "");
}
