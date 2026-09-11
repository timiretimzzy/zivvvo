import type { SupabaseClient, User } from "@supabase/supabase-js";
import { db } from "./db";

type AuthChangeCallback = (user: User | null) => void;

let clientPromise: Promise<SupabaseClient | null> | null = null;
let cachedUser: User | null = null;
let initialized = false;
let listeners: Set<AuthChangeCallback> = new Set();

async function getClient(): Promise<SupabaseClient | null> {
  if (clientPromise) return clientPromise;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) {
    clientPromise = Promise.resolve(null);
    return null;
  }
  clientPromise = import("@supabase/supabase-js").then(({ createClient }) => {
    const c = createClient(url, key, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    c.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      cachedUser = user;
      // Persist to IndexedDB so app can restore session on reload
      void db.meta.put({ key: "supabaseUser", value: user ? { id: user.id, email: user.email, user_metadata: user.user_metadata } : null });
      for (const cb of listeners) cb(user);
    });
    return c;
  });
  return clientPromise;
}

/** Bootstrap: restore cached user from IndexedDB, then hydrate from Supabase session. */
async function initAuth(): Promise<void> {
  if (initialized) return;
  initialized = true;
  const meta = await db.meta.get("supabaseUser");
  if (meta?.value) {
    cachedUser = meta.value as User;
    // Hydrate in background from Supabase session
    void getClient().then(async (c) => {
      if (!c) return;
      const { data } = await c.auth.getSession();
      const freshUser = data.session?.user ?? null;
      if (freshUser?.id !== cachedUser?.id) {
        cachedUser = freshUser;
        await db.meta.put({ key: "supabaseUser", value: freshUser ? { id: freshUser.id, email: freshUser.email, user_metadata: freshUser.user_metadata } : null });
        for (const cb of listeners) cb(freshUser);
      }
    });
  }
}

export async function signInWithGoogle(): Promise<void> {
  const c = await getClient();
  if (!c) {
    console.error("[Zivvvo] Supabase client not initialised — check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
    throw new Error("Supabase not configured");
  }
  const { data, error } = await c.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
      skipBrowserRedirect: false,
    },
  });
  if (error) {
    console.error("[Zivvvo] signInWithOAuth error:", error.message, error);
    throw error;
  }
  // If Supabase returns a URL instead of redirecting, navigate manually
  if (data?.url) {
    window.location.href = data.url;
  }
}

export async function signOut(): Promise<void> {
  const c = await getClient();
  if (c) await c.auth.signOut();
  cachedUser = null;
  await db.meta.put({ key: "supabaseUser", value: null });
  for (const cb of listeners) cb(null);
}

export async function getCurrentUser(): Promise<User | null> {
  await initAuth();
  if (cachedUser) return cachedUser;
  const c = await getClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  const user = data.session?.user ?? null;
  if (user) {
    cachedUser = user;
    await db.meta.put({ key: "supabaseUser", value: { id: user.id, email: user.email, user_metadata: user.user_metadata } });
  }
  return user;
}

export function onAuthStateChange(callback: AuthChangeCallback): () => void {
  listeners.add(callback);
  // Emit current cached value immediately
  callback(cachedUser);
  // Ensure client is bootstrapped
  void initAuth();
  return () => {
    listeners.delete(callback);
  };
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getCurrentUser()) !== null;
}

export function getSupabaseUserId(): string | null {
  return cachedUser?.id ?? null;
}
