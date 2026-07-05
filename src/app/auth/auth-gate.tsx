import * as React from "react";

import type { Session } from "@supabase/supabase-js";
import { Button, Input } from "@/toolcraft/ui";
import { toast } from "sonner";

import { MRS_LOGO_URLS } from "../data/brand-kit";
import { getSupabaseClient, isSupabaseConfigured } from "../data/backend/config";
import {
  createSupabaseBackend,
  fetchBackendSnapshot,
  subscribeToChanges,
} from "../data/backend/supabase-backend";
import {
  hydrateSnapshot,
  registerBackend,
  setDisplayName,
} from "../data/project-store";

export function signOut(): void {
  if (isSupabaseConfigured) {
    void getSupabaseClient().auth.signOut();
  }
}

function LoginCard(): React.JSX.Element {
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    try {
      const supabase = getSupabaseClient();
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          options: { data: { name: name.trim() || email.split("@")[0] } },
          password,
        });
        if (error) throw error;
        toast.success("Account created — you're in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-dvh items-center justify-center bg-[color:var(--background)]">
      <form
        className="flex w-[340px] flex-col gap-3 rounded-xl border border-[color:color-mix(in_oklab,var(--border)_16%,transparent)] bg-[color:var(--card)] p-6"
        onSubmit={(event) => void submit(event)}
      >
        <img alt="Mrs" className="h-6 w-6 invert" src={MRS_LOGO_URLS.motif} />
        <div>
          <h1 className="font-serif text-lg">Mrs Content Studio</h1>
          <p className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
            {mode === "signin"
              ? "Sign in to the team workspace."
              : "Create your team account."}
          </p>
        </div>
        {mode === "signup" ? (
          <Input
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            value={name}
          />
        ) : null}
        <Input
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          required
          type="email"
          value={email}
        />
        <Input
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          required
          type="password"
          value={password}
        />
        <Button disabled={busy} type="submit">
          {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </Button>
        <button
          className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)] transition-colors hover:text-[color:var(--foreground)]"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          type="button"
        >
          {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}

/**
 * When Supabase is configured, gates the app behind team auth and wires the
 * store to the backend (hydrate on login + realtime refetch). Without config,
 * renders children untouched — demo mode.
 */
export function AuthGate(props: { children: React.ReactNode }): React.JSX.Element {
  const [session, setSession] = React.useState<Session | null>(null);
  const [ready, setReady] = React.useState(!isSupabaseConfigured);

  React.useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }
    const supabase = getSupabaseClient();
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  React.useEffect(() => {
    if (!isSupabaseConfigured || !session) {
      return;
    }
    registerBackend(createSupabaseBackend());
    const author =
      (session.user.user_metadata?.name as string | undefined) ??
      session.user.email?.split("@")[0] ??
      "Teammate";
    setDisplayName(author);

    const refetch = (): void => {
      fetchBackendSnapshot()
        .then((data) =>
          hydrateSnapshot({ ...data, folderName: "Team workspace", source: "cloud" }),
        )
        .catch((error: Error) => {
          console.error(error);
          toast.error(`Sync failed: ${error.message}`);
        });
    };
    refetch();
    const channel = subscribeToChanges(refetch);

    return () => {
      void channel.unsubscribe();
      registerBackend(null);
    };
  }, [session]);

  if (!isSupabaseConfigured) {
    return <>{props.children}</>;
  }
  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[color:var(--background)]">
        <span className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
          Connecting…
        </span>
      </div>
    );
  }
  if (!session) {
    return <LoginCard />;
  }
  return <>{props.children}</>;
}
