import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '❌ Variables Supabase manquantes dans .env.local\n' +
    'Ajoute ces deux lignes dans nestmatch/.env.local :\n' +
    'NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co\n' +
    'NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)
