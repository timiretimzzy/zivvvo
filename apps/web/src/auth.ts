import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { db } from "./db";

type AuthChangeCallback = (user: User | null) => void;

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let supabase: SupabaseClient | null = null;
let cachedUser: User | null = null;
let initialized = false;
let listeners: Set<AuthChangeCallback> = new Set();

function getClient(): SupabaseClient | null {
  if (supabase) return supabase;
  if (!url || !key) {
    console.error("[Zivvvo] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing");
    return null;
  }
  supabase = createClient(url, key, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null;
    cachedUser = user;
    void db.meta.put({
      key: "supabaseUser",
      value: user
        ? { id: user.id, email: user.email, user_metadata: user.user_metadata }
        : null,
    });
    for (const cb of listeners) cb(user);
  });
  return supabase;
}

async function initAuth(): Promise<void> {
  if (initialized) return;
  initialized = true;
  const c = getClient();
  if (c) {
    const { data } = await c.auth.getSession();
    const sessionUser = data.session?.user ?? null;
    const meta = await db.meta.get("supabaseUser");
    const cachedUserFromDb = meta?.value as User | null;
    if (sessionUser?.id !== cachedUserFromDb?.id) {
      cachedUser = sessionUser;
      await db.meta.put({
        key: "supabaseUser",
        value: sessionUser
          ? { id: sessionUser.id, email: sessionUser.email, user_metadata: sessionUser.user_metadata }
          : null,
      });
      for (const cb of listeners) cb(sessionUser);
    } else if (cachedUserFromDb) {
      cachedUser = cachedUserFromDb;
    }
  }
}

export async function signInWithGoogle(): Promise<void> {
  if (!url || !key) {
    throw new Error("Supabase not configured — check environment variables");
  }
  const c = getClient();
  if (!c) {
    throw new Error("Supabase client failed to initialize");
  }
  const { error } = await c.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const c = getClient();
  if (c) await c.auth.signOut();
  cachedUser = null;
  await db.meta.put({ key: "supabaseUser", value: null });
  for (const cb of listeners) cb(null);
}

export async function getCurrentUser(): Promise<User | null> {
  await initAuth();
  if (cachedUser) return cachedUser;
  const c = getClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  const user = data.session?.user ?? null;
  if (user) {
    cachedUser = user;
    await db.meta.put({
      key: "supabaseUser",
      value: { id: user.id, email: user.email, user_metadata: user.user_metadata },
    });
  }
  return user;
}

export function onAuthStateChange(callback: AuthChangeCallback): () => void {
  listeners.add(callback);
  callback(cachedUser);
  getClient();
  void initAuth();
  return () => { listeners.delete(callback); };
}

export function isAuthenticated(): boolean {
  return cachedUser !== null;
}

export function getSupabaseUserId(): string | null {
  return cachedUser?.id ?? null;
}
