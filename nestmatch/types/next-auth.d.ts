import NextAuth, { DefaultSession, DefaultJWT } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: "locataire" | "proprietaire"
      isAdmin: boolean
      identiteVerrouillee: boolean
    } & DefaultSession["user"]
  }

  interface User {
    id: string
    role: "locataire" | "proprietaire"
    isAdmin: boolean
    identiteVerrouillee?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string
    role: "locataire" | "proprietaire"
    isAdmin: boolean
    identiteVerrouillee?: boolean
  }
}
