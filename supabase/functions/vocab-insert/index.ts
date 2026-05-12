// Retired 2026-05-12. The one-shot vocabulary_words seed it served is
// complete: 865 NDA-prep words are in the table, all with audio_path
// populated. The canonical seed lives at `scripts/vocab/entries.json` and is
// re-runnable via `scripts/vocab/upload.py` if needed (which talks to the
// regular supabase-js insert path, not this edge function).
//
// The original implementation accepted unauthenticated POST and bulk-upserted
// into `vocabulary_words` — deployed with verify_jwt: false. Leaving it
// deployed indefinitely is a cost / data-integrity attack surface for no
// product benefit.

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
