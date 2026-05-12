// Retired 2026-05-12. Phase 1 forced-alignment spike completed (round 2A v2
// calibrated; verdict GREEN pending product trigger — see
// memory/project_fa_spike.md). The original implementation returned a signed
// URL for a session's retained spike audio, deployed with verify_jwt: false
// and authorised via service role + obscure session-id as a practical
// capability. Now that the spike is parked and the retained audio has been
// cleaned up, leaving an unauthenticated endpoint open serves no purpose.
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
