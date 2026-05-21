import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      username?: string;
      role?: "OWNER" | "PRODUCTION" | "SALES";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    username?: string;
    role?: "OWNER" | "PRODUCTION" | "SALES";
  }
}
