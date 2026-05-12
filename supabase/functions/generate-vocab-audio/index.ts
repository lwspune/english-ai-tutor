// Retired 2026-05-12 as part of Phase D of the security-review fix plan
// (Finding 4). The original implementation accepted unauthenticated POST
// requests and called OpenAI TTS — a cost-attack vector. All 865 vocab
// words already have `audio_path` populated.
//
// If audio re-seeding is ever needed (e.g. corrupted MP3s, new vocab
// entries added), restore the original file from git history (this
// file's parent commit), redeploy, run, and retire again.

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
