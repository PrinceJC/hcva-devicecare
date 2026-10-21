import { createClient } from '@supabase/supabase-js';

// For a Vite + React browser frontend. For Next.js, use @supabase/ssr instead.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Set your Supabase URL and publishable key.');
export const supabase = createClient(url, key);
