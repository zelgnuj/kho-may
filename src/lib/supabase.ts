import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Khoá "anon" của Supabase được thiết kế để nằm trong app (công khai); dữ liệu được bảo vệ bằng RLS theo từng tài khoản.
const URL = import.meta.env.VITE_SUPABASE_URL || 'https://ejatxebyfupvvhhjptcm.supabase.co';
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqYXR4ZWJ5ZnVwdnZoaGpwdGNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1MjE2MzgsImV4cCI6MjEwNzA5NzYzOH0.cTIM1mqqJTQECwqiG-d-ZtBJhhUHsYuTbns1REowSUI';

export const supabase: SupabaseClient = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'camera-cabinet-auth' }
});
