import { createHash, randomUUID } from "node:crypto";

import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import AzureADProvider from "next-auth/providers/azure-ad";

import { logAuditEvent } from "@/lib/audit";
import { getTeamsForUser } from "@/lib/data/mock-data";
import { env, isAzureSsoConfigured, isLocalCredentialFallbackConfigured } from "@/lib/env";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getClientIpFromUnknownRequest, secureEqual } from "@/lib/security/request";

const providers: NextAuthOptions["providers"] = [];

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function verifyLocalAdminPassword(candidatePassword: string) {
  if (env.LOCAL_ADMIN_PASSWORD_SHA256) {
    return secureEqual(
      sha256Hex(candidatePassword).toLowerCase(),
      env.LOCAL_ADMIN_PASSWORD_SHA256.toLowerCase(),
    );
  }

  if (env.LOCAL_ADMIN_PASSWORD) {
    return secureEqual(candidatePassword, env.LOCAL_ADMIN_PASSWORD);
  }

  return false;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (isAzureSsoConfigured()) {
  providers.push(
    AzureADProvider({
      clientId: env.AZURE_AD_CLIENT_ID ?? "",
      clientSecret: env.AZURE_AD_CLIENT_SECRET ?? "",
      tenantId: env.AZURE_AD_TENANT_ID ?? "common",
      authorization: {
        params: {
          scope: "openid profile email offline_access User.Read",
          prompt: "select_account",
        },
      },
    }),
  );
}

if (isLocalCredentialFallbackConfigured()) {
  providers.push(
    CredentialsProvider({
      id: "local-admin",
      name: "Local Admin",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials.password) {
          await sleep(200);
          return null;
        }

        const sourceIp = getClientIpFromUnknownRequest(req);
        const normalizedEmail = normalizeEmail(credentials.email);
        const rateLimit = checkRateLimit(
          `auth:local-admin:${sourceIp}:${normalizedEmail}`,
          {
            maxRequests: 8,
            windowMs: 60 * 1000,
          },
        );

        if (!rateLimit.allowed) {
          await sleep(350);
          return null;
        }

        const emailIsValid = Boolean(
          env.LOCAL_ADMIN_EMAIL &&
            secureEqual(normalizedEmail, normalizeEmail(env.LOCAL_ADMIN_EMAIL)),
        );
        const passwordIsValid = verifyLocalAdminPassword(credentials.password);

        if (!emailIsValid || !passwordIsValid) {
          await sleep(250);
          return null;
        }

        return {
          id: randomUUID(),
          email: credentials.email,
          name: "Local Admin",
        };
      },
    }),
  );
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8,
  },
  pages: {
    signIn: "/signin",
  },
  providers,
  callbacks: {
    async signIn({ user }) {
      if (!user.email) {
        return false;
      }

      if (env.APP_ALLOWED_EMAIL_DOMAIN) {
        const normalizedEmail = user.email.toLowerCase();
        const normalizedDomain = env.APP_ALLOWED_EMAIL_DOMAIN.toLowerCase();
        if (!normalizedEmail.endsWith(`@${normalizedDomain}`)) {
          return false;
        }
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        const teams = getTeamsForUser();

        token.id = (user as { id?: string }).id ?? token.sub ?? randomUUID();
        token.teams = teams;
        token.activeTeamId = teams[0]?.teamId;
      }

      return token;
    },
    async session({ session, token }) {
      if (!session.user) {
        return session;
      }

      session.user.id =
        (typeof token.id === "string" && token.id) ||
        (typeof token.sub === "string" && token.sub) ||
        randomUUID();

      session.user.activeTeamId =
        typeof token.activeTeamId === "string" ? token.activeTeamId : undefined;

      session.user.teams = Array.isArray(token.teams)
        ? (token.teams as Array<{
            teamId: string;
            teamName: string;
            teamSlug: string;
            role: "OWNER" | "ADMIN" | "ACCOUNTANT" | "VIEWER";
          }>)
        : getTeamsForUser();

      return session;
    },
  },
  events: {
    async signIn({ user }) {
      await logAuditEvent({
        action: "auth.sign_in",
        category: "auth",
        userId: (user as { id?: string }).id,
        metadata: { email: user.email },
      });
    },
    async signOut(message) {
      const userId =
        typeof message.token?.sub === "string"
          ? message.token.sub
          : undefined;

      await logAuditEvent({
        action: "auth.sign_out",
        category: "auth",
        userId,
      });
    },
  },
};

export async function auth() {
  return getServerSession(authOptions);
}

export function hasConfiguredAuthProvider() {
  return providers.length > 0;
}
