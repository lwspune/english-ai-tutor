// Deliberate-practice drill scoring.
//
// Lean variant of analyze-reading: no GPT feedback, no WPM/phrasing scoring, no
// daily-session-limit (drills are targeted practice, not full sessions). Bypasses
// the per-passage attempt cap. Enforces a per-(student, session, stumble_word)
// 3-attempt cap of its own.
//
// Scoring algorithm mirrors src/lib/drillScoring.js — keep in sync.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normalize(word: string): string {
  return String(word ?? '').replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '').toLowerCase()
}

function scoreDrillAttempt(transcript: string, stumbleWord: string): { score: number; wasCorrect: boolean } {
  const target = normalize(stumbleWord)
  if (!target) return { score: 0, wasCorrect: false }
  const tokens = String(transcript ?? '').split(/\s+/).filter(Boolean)
  const said = tokens.some((t) => normalize(t) === target)
  return said ? { score: 100, wasCorrect: true } : { score: 0, wasCorrect: false }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: corsHeaders,
      })
    }
    const token = authHeader.slice(7)

    const { audioPath, sessionId, stumbleWord, sentence } = await req.json()
    if (!audioPath || !sessionId || !stumbleWord || !sentence) {
      return new Response(
        JSON.stringify({ error: 'audioPath, sessionId, stumbleWord, sentence are required' }),
        { status: 400, headers: corsHeaders },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: corsHeaders,
      })
    }
    const studentId = user.id

    // Verify session ownership. Service-role bypasses RLS so re-check.
    const { data: session, error: sErr } = await supabase
      .from('sessions')
      .select('id, student_id')
      .eq('id', sessionId)
      .single()
    if (sErr || !session || session.student_id !== studentId) {
      await supabase.storage.from('audio').remove([audioPath])
      return new Response(JSON.stringify({ error: 'Session not found or not owned' }), {
        status: 403,
        headers: corsHeaders,
      })
    }

    // Attempt cap: 3 per (student, session, stumble_word). Compare on lower(stumble_word)
    // to match how the table stores it (preserving casing from the drill card).
    const normalizedWord = String(stumbleWord).toLowerCase()
    const { count: priorCount } = await supabase
      .from('drill_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .eq('session_id', sessionId)
      .ilike('stumble_word', normalizedWord)
    const attemptIndex = (priorCount ?? 0) + 1
    if (attemptIndex > 3) {
      await supabase.storage.from('audio').remove([audioPath])
      return new Response(
        JSON.stringify({ error: `You've used all 3 attempts for "${stumbleWord}".` }),
        { status: 429, headers: corsHeaders },
      )
    }

    // Download audio
    const { data: audioData, error: dlError } = await supabase.storage
      .from('audio')
      .download(audioPath)
    if (dlError) {
      return new Response(JSON.stringify({ error: dlError.message }), {
        status: 500,
        headers: corsHeaders,
      })
    }
    // Drill recordings are short (single sentence). Reject silent/accidental uploads.
    if (audioData.size < 2_000) {
      await supabase.storage.from('audio').remove([audioPath])
      return new Response(
        JSON.stringify({ error: 'Recording is too short. Please read the sentence aloud.' }),
        { status: 400, headers: corsHeaders },
      )
    }

    // Whisper transcription. Plain text response is enough — no word timestamps needed.
    const formData = new FormData()
    formData.append('file', new File([audioData], 'audio.webm', { type: 'audio/webm' }))
    formData.append('model', 'whisper-1')
    formData.append('response_format', 'json')

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
      body: formData,
    })
    if (!whisperRes.ok) {
      const errText = await whisperRes.text()
      return new Response(JSON.stringify({ error: `Whisper error: ${errText}` }), {
        status: 500,
        headers: corsHeaders,
      })
    }
    const whisperData = await whisperRes.json()
    const transcript: string = whisperData.text ?? ''

    const { score, wasCorrect } = scoreDrillAttempt(transcript, stumbleWord)

    const { data: attempt, error: insertErr } = await supabase
      .from('drill_attempts')
      .insert({
        student_id: studentId,
        session_id: sessionId,
        stumble_word: stumbleWord,
        sentence,
        score,
        was_correct: wasCorrect,
        attempt_index: attemptIndex,
      })
      .select('id, attempt_index')
      .single()

    // Delete audio after scoring (same cleanup pattern as analyze-reading).
    await supabase.storage.from('audio').remove([audioPath])

    if (insertErr || !attempt) {
      return new Response(JSON.stringify({ error: insertErr?.message ?? 'Insert failed' }), {
        status: 500,
        headers: corsHeaders,
      })
    }

    return new Response(
      JSON.stringify({
        attemptId: attempt.id,
        attemptIndex: attempt.attempt_index,
        score,
        wasCorrect,
        transcript,
      }),
      { status: 200, headers: corsHeaders },
    )
  } catch (err) {
    console.error('analyze-drill error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
