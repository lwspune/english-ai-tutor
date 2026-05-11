// One-shot helper: generate MP3 pronunciations for vocabulary words via
// OpenAI TTS, upload to the `vocab-audio` bucket, and record the path on
// vocabulary_words.audio_path. Service-role only; called by scripts/vocab/seed_audio.py.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VOICE = 'nova'
const MODEL = 'tts-1'

async function generateOne(word: string): Promise<Uint8Array> {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      voice: VOICE,
      input: word,
      response_format: 'mp3',
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI TTS error (${res.status}): ${errText}`)
  }
  return new Uint8Array(await res.arrayBuffer())
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { word_ids } = await req.json()
    if (!Array.isArray(word_ids) || word_ids.length === 0) {
      return new Response(JSON.stringify({ error: 'word_ids must be a non-empty array' }), { status: 400, headers: corsHeaders })
    }
    if (word_ids.length > 60) {
      return new Response(JSON.stringify({ error: 'max 60 word_ids per batch' }), { status: 400, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: rows, error: fetchErr } = await supabase
      .from('vocabulary_words')
      .select('id, word, audio_path')
      .in('id', word_ids)
    if (fetchErr) {
      return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500, headers: corsHeaders })
    }

    const results: { id: string; status: 'generated' | 'skipped' | 'failed'; reason?: string }[] = []

    for (const row of rows ?? []) {
      if (row.audio_path) {
        results.push({ id: row.id, status: 'skipped', reason: 'already has audio_path' })
        continue
      }
      const path = `pronunciation/${row.id}.mp3`
      try {
        const mp3 = await generateOne(row.word)
        const { error: upErr } = await supabase.storage
          .from('vocab-audio')
          .upload(path, mp3, { contentType: 'audio/mpeg', upsert: true })
        if (upErr) throw new Error(`upload: ${upErr.message}`)
        const { error: dbErr } = await supabase
          .from('vocabulary_words')
          .update({ audio_path: path })
          .eq('id', row.id)
        if (dbErr) throw new Error(`db: ${dbErr.message}`)
        results.push({ id: row.id, status: 'generated' })
      } catch (err) {
        results.push({ id: row.id, status: 'failed', reason: String(err) })
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
