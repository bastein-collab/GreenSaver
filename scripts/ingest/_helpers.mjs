// scripts/ingest/_helpers.mjs
import { createClient } from '@supabase/supabase-js';

export function makeClient() {
  const url = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !service) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
  return createClient(url, service, { auth: { persistSession: false } });
}

export async function getDispensaryId(supabase, { name, city, postal_code, website, lat, lon }) {
  // Try by website then by name
  if (website) {
    const { data } = await supabase.from('dispensaries').select('id').eq('website', website).maybeSingle();
    if (data?.id) return data.id;
  }
  if (name) {
    const { data } = await supabase.from('dispensaries').select('id').eq('name', name).maybeSingle();
    if (data?.id) return data.id;
  }
  // Create if missing
  const { data, error } = await supabase
    .from('dispensaries')
    .insert({ name, city, postal_code, website, lat, lon })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function getBrandId(supabase, name) {
  const norm = String(name ?? '').trim();
  if (!norm) return null;
  // Use UPSERT to avoid unique violations under concurrency or duplicates
  const { data, error } = await supabase
    .from('brands')
    .upsert({ name: norm }, { onConflict: 'name' })
    .select('id')
    .single();
  if (error) {
    // Fallback in case of case/whitespace differences
    const { data: existing } = await supabase
      .from('brands')
      .select('id')
      .ilike('name', norm)
      .maybeSingle();
    if (existing?.id) return existing.id;
    throw error;
  }
  return data.id;
}

export function toCents(price) {
  if (price == null) return 0;
  const n = Number(price);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
