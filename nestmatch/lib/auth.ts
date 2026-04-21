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

        if (user.is_banned === true) {
          return null
        }

        const passwordValid = await bcrypt.compare(credentials.password, user.password_hash)
        if (!passwordValid) return null

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
    async signIn({ user, account, profile }) {
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
          // Pré-remplit profils avec given_name/family_name de Google. Le
          // user passera ensuite par /onboarding/identite pour confirmer
          // (verrouillage définitif à ce moment).
          const googleProfile = profile as { given_name?: string; family_name?: string } | undefined
          await supabaseAdmin.from("profils").upsert(
            {
              email: user.email.toLowerCase(),
              prenom: googleProfile?.given_name || null,
              nom: googleProfile?.family_name || null,
              identite_verrouillee: false,
            },
            { onConflict: "email" },
          )
        } else {
          if (existing.is_banned === true) return false
          user.id = existing.id
          user.role = existing.role as "locataire" | "proprietaire"
          user.isAdmin = existing.is_admin
        }
      }
      return true
    },

    async jwt({ token, user, account, trigger }) {
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

      // identiteVerrouillee : source de vérité = profils.identite_verrouillee.
      // Self-healing : tant que le flag n'est pas `true` dans le JWT, on re-query
      // la DB à chaque refresh. Une fois verrouillé (true), on early-exit et on
      // arrête d'interroger (verrou définitif côté DB). Évite les JWT stale qui
      // bouclent entre /dossier et /onboarding/identite quand le user s'est
      // verrouillé après émission du JWT.
      if (token.email && (token.identiteVerrouillee !== true || trigger === "update")) {
        const { data } = await supabaseAdmin
          .from("profils")
          .select("identite_verrouillee")
          .eq("email", (token.email as string).toLowerCase())
          .maybeSingle()
        token.identiteVerrouillee = data?.identite_verrouillee === true
      }

      return token
    },

    async session({ session, token }) {
      session.user.id = token.id
      session.user.role = token.role
      session.user.isAdmin = token.isAdmin
      session.user.identiteVerrouillee = token.identiteVerrouillee === true
      return session
    },
  },
}
