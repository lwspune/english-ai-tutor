// One-shot vocab seeding helper. Accepts a batch of words, returns structured
// entries (definition, synonyms, antonyms, etc.) via GPT-4o-mini. Called by
// scripts/vocab/seed.py during the initial vocabulary load. Remove once seeding
// is complete.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SCHEMA = {
  type: 'object',
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          word: { type: 'string' },
          part_of_speech: { type: 'string', enum: ['noun', 'verb', 'adjective', 'adverb', 'phrase'] },
          definition: { type: 'string' },
          example_sentence: { type: 'string' },
          synonyms: { type: 'array', items: { type: 'string' } },
          antonyms: { type: 'array', items: { type: 'string' } },
          difficulty: { type: 'string', enum: ['medium', 'hard', 'very_hard'] },
        },
        required: ['word', 'part_of_speech', 'definition', 'example_sentence', 'synonyms', 'antonyms', 'difficulty'],
        additionalProperties: false,
      },
    },
  },
  required: ['entries'],
  additionalProperties: false,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { words } = await req.json()
    if (!Array.isArray(words) || words.length === 0) {
      return new Response(JSON.stringify({ error: 'words must be a non-empty array' }), { status: 400, headers: corsHeaders })
    }
    if (words.length > 60) {
      return new Response(JSON.stringify({ error: 'max 60 words per batch' }), { status: 400, headers: corsHeaders })
    }

    const prompt = `For each English word below, produce a JSON entry. Definitions and examples are for senior high-school students (grades 11-12, India / NDA exam context). Keep definitions concise (10-20 words). Each example_sentence must contain the word verbatim. Synonyms and antonyms should be common English words (3-4 synonyms, 2-3 antonyms). Difficulty: 'medium' for everyday, 'hard' for advanced, 'very_hard' for rare/literary.

Words:
${words.map((w: string, i: number) => `${i + 1}. ${w}`).join('\n')}

Return entries in the same order as the input.`

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'vocab_entries', strict: true, schema: SCHEMA },
        },
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return new Response(JSON.stringify({ error: `OpenAI: ${errText}` }), { status: 502, headers: corsHeaders })
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content ?? ''
    const parsed = JSON.parse(content)
    return new Response(
      JSON.stringify({
        entries: parsed.entries ?? [],
        usage: data.usage ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
