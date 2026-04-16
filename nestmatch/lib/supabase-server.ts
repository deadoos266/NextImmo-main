import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    '❌ Variables Supabase serveur manquantes dans .env.local\n' +
    'Ajoute ces lignes dans nestmatch/.env.local :\n' +
    'NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co\n' +
    'SUPABASE_SERVICE_ROLE_KEY=eyJ...'
  )
}

// Server-only client with service role — bypasses RLS.
// NEVER import this file in client components or pages marked "use client".
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
