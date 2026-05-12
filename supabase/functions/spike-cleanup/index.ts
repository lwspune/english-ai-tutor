// Retired 2026-05-12. Phase 1 forced-alignment spike completed and the seven
// retained audio files have already been deleted (see
// memory/project_fa_spike.md "Status: PARKED"). The original implementation
// bulk-deleted every retained audio file from the `audio` bucket and cleared
// `spike_audio_path` on all sessions. Deployed with verify_jwt: false and
// authorised internally via service role.
//
// If the spike is ever revived, restore from git history (parent commit of
// this stub) — the spike infrastructure (migration 014, try_claim_spike_slot,
// scripts/spike/*) is unchanged in the repo.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  return new Response(
    JSON.stringify({ error: 'retired' }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
