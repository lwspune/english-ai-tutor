import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const WPM_TARGETS: Record<number, number> = { 9: 140, 10: 150, 11: 160, 12: 170 }

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
const endsWithPunctuation = (s: string) => /[.,!?;:]$/.test(s.trim())

// Sequence alignment: aligns spokenWords to passageWords using DP.
// Returns one entry per passage word: correct | substitution | omission.
function alignWords(
  passageWords: string[],
  spokenWords: string[],
): { word: string; spoken: string; status: 'correct' | 'substitution' | 'omission' }[] {
  const P = passageWords.length
  const S = spokenWords.length
  const INS = 1   // penalty: spoken word with no passage match
  const DEL = 2   // penalty: passage word not spoken (omission — heavier)
  const SUB = 1   // penalty: wrong word spoken

  // DP cost matrix
  const dp: number[][] = Array.from({ length: P + 1 }, () => new Array(S + 1).fill(0))
  for (let i = 1; i <= P; i++) dp[i][0] = i * DEL
  for (let j = 1; j <= S; j++) dp[0][j] = j * INS

  for (let i = 1; i <= P; i++) {
    for (let j = 1; j <= S; j++) {
      const match = normalize(passageWords[i - 1]) === normalize(spokenWords[j - 1])
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + (match ? 0 : SUB), // match or substitution
        dp[i - 1][j] + DEL,                    // omission (passage word skipped)
        dp[i][j - 1] + INS,                    // insertion (extra spoken word)
      )
    }
  }

  // Traceback
  const results: { word: string; spoken: string; status: 'correct' | 'substitution' | 'omission' }[] = []
  let i = P, j = S
  const ops: { pi: number; si: number; op: 'match' | 'sub' | 'del' | 'ins' }[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const match = normalize(passageWords[i - 1]) === normalize(spokenWords[j - 1])
      if (dp[i][j] === dp[i - 1][j - 1] + (match ? 0 : SUB)) {
        ops.push({ pi: i - 1, si: j - 1, op: match ? 'match' : 'sub' })
        i--; j--
        continue
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + DEL) {
      ops.push({ pi: i - 1, si: -1, op: 'del' })
      i--
    } else {
      ops.push({ pi: -1, si: j - 1, op: 'ins' })
      j--
    }
  }

  ops.reverse()

  for (const op of ops) {
    if (op.op === 'match') {
      results.push({ word: passageWords[op.pi], spoken: spokenWords[op.si], status: 'correct' })
    } else if (op.op === 'sub') {
      results.push({ word: passageWords[op.pi], spoken: spokenWords[op.si], status: 'substitution' })
    } else if (op.op === 'del') {
      results.push({ word: passageWords[op.pi], spoken: '', status: 'omission' })
    }
    // insertions are discarded — extra spoken words don't map to a passage word
  }

  return results
}

// Phrasing: % of long inter-word pauses that fall at punctuation boundaries.
// Whisper word objects: { word, start, end }
function computePhrasingScore(
  passageWords: string[],
  whisperWords: { word: string; start: number; end: number }[],
): number {
  if (whisperWords.length < 2) return 0

  const PAUSE_THRESHOLD = 0.4 // seconds

  let totalPauses = 0
  let punctuationPauses = 0

  for (let i = 0; i < whisperWords.length - 1; i++) {
    const gap = whisperWords[i + 1].start - whisperWords[i].end
    if (gap < PAUSE_THRESHOLD) continue
    totalPauses++

    // Find which passage word this spoken word corresponds to (rough match)
    const spokenNorm = normalize(whisperWords[i].word)
    const matchIdx = passageWords.findIndex(pw => normalize(pw) === spokenNorm)
    if (matchIdx !== -1 && endsWithPunctuation(passageWords[matchIdx])) {
      punctuationPauses++
    }
  }

  if (totalPauses === 0) return 100 // no long pauses → smooth reading
  return Math.round((punctuationPauses / totalPauses) * 100)
}

function buildFeedback(
  scoreAccuracy: number,
  scoreWpm: number,
  wpmTarget: number,
  scorePhrasing: number,
  countOmissions: number,
  countSubstitutions: number,
  difficultWords: string[],
): string {
  const lines: string[] = []

  if (scoreAccuracy >= 90) {
    lines.push('Excellent accuracy — keep it up.')
  } else if (countOmissions > countSubstitutions) {
    lines.push('You are skipping words. Slow down and point at each word as you read.')
  } else if (countSubstitutions > 0) {
    lines.push(`You substituted ${countSubstitutions} word${countSubstitutions > 1 ? 's' : ''}. Focus on reading each word carefully before moving on.`)
  }

  if (scoreWpm < wpmTarget - 20) {
    lines.push(`Your pace is ${scoreWpm} wpm — aim for ${wpmTarget} wpm. Try reading the passage aloud once before recording.`)
  } else if (scoreWpm > wpmTarget + 30) {
    lines.push('You are reading quite fast — slow down slightly so each word lands clearly.')
  }

  if (scorePhrasing < 50) {
    lines.push('You paused mid-sentence several times. Try to read to the comma or full stop before breathing.')
  }

  if (difficultWords.length > 0) {
    lines.push(`Words to practise: ${difficultWords.slice(0, 5).join(', ')}.`)
  }

  if (lines.length === 0) lines.push('Good reading overall. Keep practising to build speed and phrasing.')

  return lines.join(' ')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { audioPath, passageText, studentId, passageId, grade } = await req.json()
    console.log('Starting analysis:', { audioPath, studentId, passageId, grade })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Download audio
    const { data: audioData, error: dlError } = await supabase.storage
      .from('audio')
      .download(audioPath)
    if (dlError) {
      console.error('Storage download error:', dlError)
      return new Response(JSON.stringify({ error: dlError.message }), { status: 500, headers: corsHeaders })
    }
    console.log('Audio downloaded, size:', audioData.size)

    // Transcribe with Whisper (word-level timestamps)
    const formData = new FormData()
    formData.append('file', new File([audioData], 'audio.webm', { type: 'audio/webm' }))
    formData.append('model', 'whisper-1')
    formData.append('response_format', 'verbose_json')
    formData.append('timestamp_granularities[]', 'word')

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
      body: formData,
    })
    if (!whisperRes.ok) {
      const errText = await whisperRes.text()
      console.error('Whisper API error:', whisperRes.status, errText)
      return new Response(JSON.stringify({ error: `Whisper error: ${errText}` }), { status: 500, headers: corsHeaders })
    }
    const whisperData = await whisperRes.json()
    console.log('Whisper response:', { text: whisperData.text?.slice(0, 100), duration: whisperData.duration })

    const transcript: string = whisperData.text ?? ''
    const durationSeconds: number = whisperData.duration ?? 0
    const whisperWords: { word: string; start: number; end: number }[] = whisperData.words ?? []

    const passageWords = passageText.trim().split(/\s+/)
    const spokenWords = transcript.trim().split(/\s+/).filter(Boolean)

    // Align spoken to passage words
    const wordResults = alignWords(passageWords, spokenWords)

    // Compute metrics
    const correct = wordResults.filter(w => w.status === 'correct').length
    const countOmissions = wordResults.filter(w => w.status === 'omission').length
    const countSubstitutions = wordResults.filter(w => w.status === 'substitution').length

    const scoreAccuracy = Math.round((correct / passageWords.length) * 100)
    const scoreWpm = durationSeconds > 0 ? Math.round((passageWords.length / durationSeconds) * 60) : 0
    const scorePhrasing = computePhrasingScore(passageWords, whisperWords)

    // WPM target for grade (default grade 10)
    const wpmTarget = WPM_TARGETS[grade as number] ?? 150

    // Difficult words: passage words that weren't read correctly
    const difficultWords = wordResults
      .filter(w => w.status !== 'correct')
      .map(w => w.word.replace(/[^a-zA-Z]/g, ''))
      .filter(Boolean)

    const feedback = buildFeedback(
      scoreAccuracy, scoreWpm, wpmTarget, scorePhrasing,
      countOmissions, countSubstitutions, difficultWords,
    )

    // Save session
    const { data: session, error: dbError } = await supabase
      .from('sessions')
      .insert({
        student_id: studentId,
        passage_id: passageId,
        transcript,
        score_accuracy: scoreAccuracy,
        score_wpm: scoreWpm,
        score_fluency: scorePhrasing,   // kept for backward compat, same as phrasing
        score_phrasing: scorePhrasing,
        count_omissions: countOmissions,
        count_substitutions: countSubstitutions,
        word_results: wordResults,
        feedback,
      })
      .select()
      .single()

    if (dbError) {
      console.error('DB insert error:', dbError)
      return new Response(JSON.stringify({ error: dbError.message }), { status: 500, headers: corsHeaders })
    }

    // Delete audio after processing
    await supabase.storage.from('audio').remove([audioPath])

    return new Response(JSON.stringify({ sessionId: session.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Unhandled error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
