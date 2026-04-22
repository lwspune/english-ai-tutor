import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const WPM_TARGETS: Record<number, number> = { 9: 140, 10: 150, 11: 160, 12: 170 }

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
const endsWithPunctuation = (s: string) => /[.,!?;:]$/.test(s.trim())

// Sequence alignment: aligns spokenWords to passageWords using DP.
function alignWords(
  passageWords: string[],
  spokenWords: string[],
): { word: string; spoken: string; status: 'correct' | 'substitution' | 'omission' }[] {
  const P = passageWords.length
  const S = spokenWords.length
  const INS = 1
  const DEL = 2
  const SUB = 1

  const dp: number[][] = Array.from({ length: P + 1 }, () => new Array(S + 1).fill(0))
  for (let i = 1; i <= P; i++) dp[i][0] = i * DEL
  for (let j = 1; j <= S; j++) dp[0][j] = j * INS

  for (let i = 1; i <= P; i++) {
    for (let j = 1; j <= S; j++) {
      const match = normalize(passageWords[i - 1]) === normalize(spokenWords[j - 1])
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + (match ? 0 : SUB),
        dp[i - 1][j] + DEL,
        dp[i][j - 1] + INS,
      )
    }
  }

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
  }

  return results
}

// Phrasing: % of long inter-word pauses that fall at punctuation boundaries.
function computePhrasingScore(
  passageWords: string[],
  whisperWords: { word: string; start: number; end: number }[],
): number {
  if (whisperWords.length < 2) return 0
  const PAUSE_THRESHOLD = 0.4
  let totalPauses = 0
  let punctuationPauses = 0

  for (let i = 0; i < whisperWords.length - 1; i++) {
    const gap = whisperWords[i + 1].start - whisperWords[i].end
    if (gap < PAUSE_THRESHOLD) continue
    totalPauses++
    const spokenNorm = normalize(whisperWords[i].word)
    const matchIdx = passageWords.findIndex(pw => normalize(pw) === spokenNorm)
    if (matchIdx !== -1 && endsWithPunctuation(passageWords[matchIdx])) {
      punctuationPauses++
    }
  }

  if (totalPauses === 0) return 100
  return Math.round((punctuationPauses / totalPauses) * 100)
}

// Rule-based feedback fallback (used when AI feedback is off)
function buildRuleFeedback(
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

// AI feedback via GPT-4o-mini
async function buildAiFeedback(
  grade: number,
  scoreAccuracy: number,
  scoreWpm: number,
  wpmTarget: number,
  scorePhrasing: number,
  countOmissions: number,
  countSubstitutions: number,
  difficultWords: string[],
): Promise<string> {
  const prompt = `You are an encouraging English reading coach for a Grade ${grade} high school student.
The student just read a passage aloud. Here are their results:
- Accuracy: ${scoreAccuracy}% (words read correctly)
- Pace: ${scoreWpm} WPM (grade target: ${wpmTarget} WPM)
- Phrasing: ${scorePhrasing}% (pausing at punctuation vs mid-sentence)
- Words skipped (omissions): ${countOmissions}
- Wrong words said (substitutions): ${countSubstitutions}
- Difficult words: ${difficultWords.slice(0, 8).join(', ') || 'none'}

Respond ONLY with a JSON object using exactly these keys:
- "wentWell": one specific sentence on what they did well
- "focusOn": one or two sentences on the single most important thing to improve
- "tip": one concrete, actionable tip for their next reading session
- "practiseWords": array of up to 5 words from the difficult words list (empty array if none)`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.7,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('GPT feedback error:', err)
    return ''
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { audioPath, passageText, studentId, passageId, grade, aiFeedbackEnabled } = await req.json()
    console.log('Starting analysis:', { audioPath, studentId, passageId, grade, aiFeedbackEnabled })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Guardrail 1: max 3 attempts per passage per student
    const { count: attemptCount } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .eq('passage_id', passageId)
    if ((attemptCount ?? 0) >= 3) {
      await supabase.storage.from('audio').remove([audioPath])
      return new Response(
        JSON.stringify({ error: 'You have reached the maximum of 3 attempts for this passage.' }),
        { status: 429, headers: corsHeaders },
      )
    }

    // Download audio
    const { data: audioData, error: dlError } = await supabase.storage
      .from('audio')
      .download(audioPath)
    if (dlError) {
      console.error('Storage download error:', dlError)
      return new Response(JSON.stringify({ error: dlError.message }), { status: 500, headers: corsHeaders })
    }

    // Guardrail 2: min audio size (~5s of WebM ≈ 5 KB)
    if (audioData.size < 5_000) {
      await supabase.storage.from('audio').remove([audioPath])
      return new Response(
        JSON.stringify({ error: 'Recording is too short. Please read the full passage before submitting.' }),
        { status: 400, headers: corsHeaders },
      )
    }

    // Transcribe with Whisper
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

    const transcript: string = whisperData.text ?? ''
    const durationSeconds: number = whisperData.duration ?? 0
    const whisperWords: { word: string; start: number; end: number }[] = whisperData.words ?? []

    const passageWords = passageText.trim().split(/\s+/)
    const spokenWords = transcript.trim().split(/\s+/).filter(Boolean)

    const wordResults = alignWords(passageWords, spokenWords)

    const correct = wordResults.filter(w => w.status === 'correct').length
    const countOmissions = wordResults.filter(w => w.status === 'omission').length
    const countSubstitutions = wordResults.filter(w => w.status === 'substitution').length
    const scoreAccuracy = Math.round((correct / passageWords.length) * 100)
    const scoreWpm = durationSeconds > 0 ? Math.round((passageWords.length / durationSeconds) * 60) : 0
    const scorePhrasing = computePhrasingScore(passageWords, whisperWords)
    const wpmTarget = WPM_TARGETS[grade as number] ?? 150

    const difficultWords = wordResults
      .filter(w => w.status !== 'correct')
      .map(w => w.word.replace(/[^a-zA-Z]/g, ''))
      .filter(Boolean)

    // Guardrail 3: skip GPT if transcript is too sparse (< 20% of passage words heard)
    const transcriptCoverage = spokenWords.length / passageWords.length
    const enoughTranscript = transcriptCoverage >= 0.2

    // Generate feedback
    let feedback = ''
    if (aiFeedbackEnabled && enoughTranscript) {
      feedback = await buildAiFeedback(
        grade ?? 10,
        scoreAccuracy, scoreWpm, wpmTarget, scorePhrasing,
        countOmissions, countSubstitutions, difficultWords,
      )
    }
    // Fall back to rule-based if AI is off or GPT call failed
    if (!feedback) {
      feedback = buildRuleFeedback(
        scoreAccuracy, scoreWpm, wpmTarget, scorePhrasing,
        countOmissions, countSubstitutions, difficultWords,
      )
    }

    const { data: session, error: dbError } = await supabase
      .from('sessions')
      .insert({
        student_id: studentId,
        passage_id: passageId,
        transcript,
        score_accuracy: scoreAccuracy,
        score_wpm: scoreWpm,
        score_fluency: scorePhrasing,
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

    await supabase.storage.from('audio').remove([audioPath])

    return new Response(JSON.stringify({ sessionId: session.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Unhandled error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
