import { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { supabaseAdmin } from "./supabase-server"

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const { data: user } = await supabaseAdmin
          .from("users")
          .select("id, email, name, image, password_hash, role, is_admin, is_banned, email_verified")
          .eq("email", credentials.email.toLowerCase())
          .single()

        if (!user || !user.password_hash) return null

        // Compte banni : refuser la connexion
        if (user.is_banned === true) {
          return null
        }

        const passwordValid = await bcrypt.compare(credentials.password, user.password_hash)
        if (!passwordValid) return null

        // Email pas encore verifie via OTP 6 chiffres : bloquer la connexion.
        // Throw message specifique que /auth capte pour rediriger vers
        // /auth/verifier-email automatiquement.
        if (user.email_verified !== true) {
          throw new Error("EMAIL_NOT_VERIFIED")
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
          role: user.role as "locataire" | "proprietaire",
          isAdmin: user.is_admin,
        }
      },
    }),
  ],

  pages: {
    signIn: "/auth",
  },

  session: {
    strategy: "jwt",
  },

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        const { data: existing } = await supabaseAdmin
          .from("users")
          .select("id, role, is_admin, is_banned")
          .eq("email", user.email.toLowerCase())
          .single()

        if (!existing) {
          await supabaseAdmin.from("users").insert({
            email: user.email.toLowerCase(),
            name: user.name,
            image: user.image,
            email_verified: true,
            role: "locataire",
            is_admin: false,
          })
        } else {
          // Compte banni : refuser le login Google
          if (existing.is_banned === true) return false
          user.id = existing.id
          user.role = existing.role as "locataire" | "proprietaire"
          user.isAdmin = existing.is_admin
        }
      }
      return true
    },

    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id
        token.role = user.role ?? "locataire"
        token.isAdmin = user.isAdmin ?? false
      }

      if (account?.provider === "google" && token.email && !token.id) {
        const { data } = await supabaseAdmin
          .from("users")
          .select("id, role, is_admin")
          .eq("email", (token.email as string).toLowerCase())
          .single()

        if (data) {
          token.id = data.id
          token.role = data.role as "locataire" | "proprietaire"
          token.isAdmin = data.is_admin
        }
      }

      return token
    },

    async session({ session, token }) {
      session.user.id = token.id
      session.user.role = token.role
      session.user.isAdmin = token.isAdmin
      return session
    },
  },
}
