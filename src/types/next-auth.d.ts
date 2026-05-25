import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      username?: string;
      role?: "OWNER" | "PRODUCTION" | "SUPPORT" | "SALES" | "SHIPPING";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    username?: string;
    role?: "OWNER" | "PRODUCTION" | "SUPPORT" | "SALES" | "SHIPPING";
  }
}
