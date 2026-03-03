"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";

type Provider = {
  id: string;
  name: string;
};

export default function SignInPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerLoadError, setProviderLoadError] = useState<string | null>(null);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  useEffect(() => {
    async function loadProviders() {
      try {
        const response = await fetch("/api/auth/providers", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Unable to load sign-in providers");
        }

        const json = (await response.json()) as Record<string, Provider> | null;
        setProviders(json ? Object.values(json) : []);
      } catch {
        setProviderLoadError("Could not load authentication providers.");
      } finally {
        setProvidersLoaded(true);
      }
    }

    void loadProviders();
  }, []);

  const localProvider = useMemo(
    () => providers.find((provider) => provider.id === "local-admin"),
    [providers],
  );

  const externalProviders = useMemo(
    () => providers.filter((provider) => provider.id !== "local-admin"),
    [providers],
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-6">
      <div className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-900)] p-8 shadow-[0_30px_70px_-45px_rgba(0,0,0,0.95)]">
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-400)]">Secure Sign-In</p>
        <h1 className="mt-2 font-display text-3xl text-[var(--text-100)]">Portal Access</h1>

        <div className="mt-6 space-y-3">
          {!providersLoaded && (
            <p className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-800)] px-3 py-2 text-sm text-[var(--text-300)]">
              Loading sign-in providers...
            </p>
          )}

          {providerLoadError && (
            <p className="rounded-xl border border-red-300/30 bg-red-300/10 px-3 py-2 text-sm text-red-100">
              {providerLoadError}
            </p>
          )}

          {externalProviders.map((provider) => (
            <Button
              key={provider.id}
              className="w-full"
              onClick={() => {
                setLoadingProvider(provider.id);
                void signIn(provider.id, { callbackUrl: "/dashboard" });
              }}
            >
              {loadingProvider === provider.id
                ? "Redirecting..."
                : `Continue with ${provider.name}`}
            </Button>
          ))}

          {providersLoaded && !externalProviders.length && (
            <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
              No SSO provider is configured.
              {localProvider
                ? " Use the Local fallback form below to sign in."
                : " Add Google or Azure Entra credentials to enable SSO sign-in."}
            </p>
          )}
        </div>

        {localProvider && (
          <form
            className="mt-6 space-y-3 border-t border-[var(--border-soft)] pt-6"
            onSubmit={(event) => {
              event.preventDefault();
              setLoadingProvider(localProvider.id);
              void signIn(localProvider.id, {
                email,
                password,
                callbackUrl: "/dashboard",
              });
            }}
          >
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-400)]">
              Local fallback
            </p>
            <input
              className="w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-800)] px-3 py-2 text-sm text-[var(--text-100)] outline-none focus:border-[var(--brand-400)]"
              placeholder="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <input
              className="w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-800)] px-3 py-2 text-sm text-[var(--text-100)] outline-none focus:border-[var(--brand-400)]"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button className="w-full" type="submit">
              {loadingProvider === localProvider.id ? "Signing in..." : "Use local admin"}
            </Button>
          </form>
        )}

        <Link href="/" className="mt-6 inline-block text-sm text-[var(--text-300)] hover:text-[var(--text-100)]">
          Back to homepage
        </Link>
      </div>
    </main>
  );
}
