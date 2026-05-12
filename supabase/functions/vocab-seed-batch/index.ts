// Retired 2026-05-12 as part of Phase D of the security-review fix plan
// (Finding 4). The original implementation accepted unauthenticated POST
// requests and called GPT to generate vocabulary entries — a cost-attack
// vector. The one-shot seed it served is complete: `scripts/vocab/entries.json`
// is the canonical 865-word list.
//
// If vocab expansion is ever needed again, restore the original file from
// git history (this file's parent commit) and run the seed flow.

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
