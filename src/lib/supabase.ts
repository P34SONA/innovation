import { createClient } from '@supabase/supabase-js';

const CFG_KEY = 'taskflow_supabase_config';

export function getSupabaseConfig() {
  const saved = localStorage.getItem(CFG_KEY);
  return saved ? JSON.parse(saved) : null;
}

export function saveSupabaseConfig(url: string, key: string) {
  localStorage.setItem(CFG_KEY, JSON.stringify({ url, key }));
}

export function removeSupabaseConfig() {
  localStorage.removeItem(CFG_KEY);
}

export function createSupabaseClient(url: string, key: string) {
  return createClient(url, key);
}

// Global variable for current client instance
let sbInstance: any = null;

export function setSb(client: any) {
  sbInstance = client;
}

export function getSb() {
  return sbInstance;
}
