// Teacher-only signed URL minter for retained research-retention audio.
//
// Deployed with verify_jwt: false (Supabase's new sb_publishable_... key
// format is not a JWT). Authenticates explicitly inside via
// supabase.auth.getUser(token) + profile.role check. Only teachers can mint
// URLs.
//
// Body: { sessionId }
// Response: { url } — 10-minute signed URL for the session's retained audio
//   (404 if session has no retained_audio_path, 403 if caller is not teacher).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { sessionId } = await req.json()
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'sessionId required' }), {
        status: 400,
        headers: corsHeaders,
      })
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

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'teacher') {
      return new Response(JSON.stringify({ error: 'Teacher role required' }), {
        status: 403,
        headers: corsHeaders,
      })
    }

    const { data: session, error: sErr } = await supabase
      .from('sessions')
      .select('retained_audio_path')
      .eq('id', sessionId)
      .single()
    if (sErr || !session || !session.retained_audio_path) {
      return new Response(JSON.stringify({ error: 'No retained audio for this session' }), {
        status: 404,
        headers: corsHeaders,
      })
    }

    const { data: signed, error: urlErr } = await supabase.storage
      .from('audio')
      .createSignedUrl(session.retained_audio_path, 600)
    if (urlErr || !signed?.signedUrl) {
      return new Response(JSON.stringify({ error: urlErr?.message ?? 'Sign failed' }), {
        status: 500,
        headers: corsHeaders,
      })
    }

    return new Response(
      JSON.stringify({ url: signed.signedUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('retained-audio-url error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
