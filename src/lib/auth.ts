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
export const ROLES = ["OWNER", "PRODUCTION", "SUPPORT", "SALES", "SHIPPING"] as const;
export type Role = (typeof ROLES)[number];

export function isSupport(role?: string) {
  return role === "SUPPORT";
}
export function isShipping(role?: string) {
  return role === "SHIPPING";
}
export function canCreateJob(role?: string) {
  return role === "PRODUCTION" || role === "OWNER" || role === "SUPPORT";
}
export function canFullEdit(role?: string) {
  return role === "PRODUCTION" || role === "OWNER";
}
// Who can receive parcels into the warehouse (and thus add stock).
export function canReceiveStock(role?: string) {
  return role === "OWNER" || role === "PRODUCTION" || role === "SHIPPING";
}
// Who can manage the materials master/stock (add / edit / adjust / import / delete).
// Production + warehouse (SHIPPING). SUPPORT only files job requests — materials
// belong to PRODUCTION, so SUPPORT is read-only on stock.
export function canEditMaterials(role?: string) {
  return role === "OWNER" || role === "PRODUCTION" || role === "SHIPPING";
}
// Who can confirm an outbound shipment (finished job → SHIPPED). The warehouse
// team (SHIPPING) dispatches; PRODUCTION/OWNER can also confirm.
export function canShip(role?: string) {
  return role === "OWNER" || role === "PRODUCTION" || role === "SHIPPING";
}
