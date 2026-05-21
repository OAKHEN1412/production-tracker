import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials.password) return null;
        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
        });
        if (!user) return null;
        const ok = await bcrypt.compare(credentials.password, user.password);
        if (!ok) return null;
        return {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.username = (user as any).username;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).username = token.username;
      }
      return session;
    },
  },
};

export function isProduction(role?: string) {
  return role === "PRODUCTION";
}
export function isSales(role?: string) {
  return role === "SALES";
}
export function isOwner(role?: string) {
  return role === "OWNER";
}
export const ROLES = ["OWNER", "PRODUCTION", "SUPPORT", "SALES"] as const;
export type Role = (typeof ROLES)[number];

export function isSupport(role?: string) {
  return role === "SUPPORT";
}
export function canCreateJob(role?: string) {
  return role === "PRODUCTION" || role === "OWNER" || role === "SUPPORT";
}
export function canFullEdit(role?: string) {
  return role === "PRODUCTION" || role === "OWNER";
}
