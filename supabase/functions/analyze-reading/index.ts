import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
  const { audioPath, passageText, studentId, passageId } = await req.json()
  console.log('Starting analysis:', { audioPath, studentId, passageId })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Download audio from storage
  const { data: audioData, error: dlError } = await supabase.storage
    .from('audio')
    .download(audioPath)
  if (dlError) {
    console.error('Storage download error:', dlError)
    return new Response(JSON.stringify({ error: dlError.message }), { status: 500, headers: corsHeaders })
  }
  console.log('Audio downloaded, size:', audioData.size)

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
  console.log('Whisper response:', { text: whisperData.text?.slice(0, 100), duration: whisperData.duration })

  const transcript: string = whisperData.text ?? ''
  const durationSeconds: number = whisperData.duration ?? 0

  // Score accuracy: word-level diff
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
  const passageWords = passageText.trim().split(/\s+/)
  const spokenWords = transcript.trim().split(/\s+/).map(normalize)

  let correct = 0
  const wordResults = passageWords.map((word: string, i: number) => {
    const expected = normalize(word)
    const spoken = spokenWords[i] ?? ''
    const status = spoken === expected ? 'correct' : spoken === '' ? 'skipped' : 'mispronounced'
    if (status === 'correct') correct++
    return { word, spoken: spokenWords[i] ?? '', status }
  })

  const scoreAccuracy = Math.round((correct / passageWords.length) * 100)
  const scoreWpm = durationSeconds > 0 ? Math.round((passageWords.length / durationSeconds) * 60) : 0

  // Fluency: penalise for skipped words
  const skipped = wordResults.filter((w: { status: string }) => w.status === 'skipped').length
  const scoreFluency = Math.round(((passageWords.length - skipped) / passageWords.length) * 100)

  // Simple feedback
  let feedback = ''
  if (scoreAccuracy >= 90) feedback = 'Excellent reading! Your accuracy is outstanding.'
  else if (scoreAccuracy >= 75) feedback = 'Good reading. Focus on the highlighted words to improve further.'
  else if (scoreAccuracy >= 60) feedback = 'Keep practising. Pay attention to mispronounced and skipped words.'
  else feedback = 'This passage needs more practice. Try reading it slowly before recording again.'

  // Save session to DB
  const { data: session, error: dbError } = await supabase
    .from('sessions')
    .insert({
      student_id: studentId,
      passage_id: passageId,
      transcript,
      score_accuracy: scoreAccuracy,
      score_wpm: scoreWpm,
      score_fluency: scoreFluency,
      word_results: wordResults,
      feedback,
    })
    .select()
    .single()

  if (dbError) {
    console.error('DB insert error:', dbError)
    return new Response(JSON.stringify({ error: dbError.message }), { status: 500, headers: corsHeaders })
  }

  return new Response(JSON.stringify({ sessionId: session.id }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
  } catch (err) {
    console.error('Unhandled error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
