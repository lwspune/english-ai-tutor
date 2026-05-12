import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_GRADES = new Set(['9', '10', '11', '12', 'MBA'])
const SITE_URL = 'https://english-ai-tutor-mauve.vercel.app'
const RESET_URL = `${SITE_URL}/reset-password`
const FROM_EMAIL = 'tutor@lwspune.in'

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function validateStudent(s: { full_name?: string; email?: string; password?: string; grade?: string }): string[] {
  const errors: string[] = []
  if (!s.full_name?.trim()) errors.push('Name required')
  if (!s.email || !isValidEmail(s.email)) errors.push('Invalid email')
  if (!s.password || s.password.length < 8) errors.push('Password min 8 chars')
  if (!s.grade || !VALID_GRADES.has(s.grade)) errors.push('Invalid grade')
  return errors
}

async function sendWelcomeEmail(name: string, email: string, activationLink: string, apiKey: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: email,
      subject: 'Welcome to English AI Tutor — Set Your Password',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1e293b">Welcome, ${name}!</h2>
          <p style="color:#475569">Your English AI Tutor account is ready. Click the button below to set your password and sign in.</p>
          <a href="${activationLink}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">
            Set your password →
          </a>
          <p style="color:#94a3b8;font-size:12px;margin-top:8px">This link expires soon. If it does, your teacher can resend it, or use the "Forgot password?" option on the sign-in page.</p>
          <p style="color:#94a3b8;font-size:12px;margin-top:24px">English AI Tutor · LWS Pune</p>
        </div>
      `,
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: corsHeaders,
      })
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'teacher') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
    }

    const { students } = await req.json()
    if (!Array.isArray(students) || students.length === 0) {
      return new Response(JSON.stringify({ error: 'students array is required' }), {
        status: 400, headers: corsHeaders,
      })
    }

    const resendKey = Deno.env.get('RESEND_API_KEY')
    const results = []
    const emailQueue: { name: string; email: string }[] = []

    for (const s of students) {
      const errors = validateStudent(s)
      if (errors.length > 0) {
        results.push({ email: s.email ?? '', success: false, error: errors.join('; ') })
        continue
      }

      const { data, error } = await adminClient.auth.admin.createUser({
        email: s.email,
        password: s.password,
        email_confirm: true,
        user_metadata: { full_name: s.full_name.trim(), role: 'student', grade: s.grade },
      })

      if (error) {
        console.error('createUser error for', s.email, JSON.stringify(error))
        const errMsg = error.message || error.code || JSON.stringify(error) || 'Failed to create user'
        results.push({ email: s.email, success: false, error: errMsg })
      } else if (!data?.user?.id) {
        console.error('createUser returned no user for', s.email, JSON.stringify(data))
        results.push({ email: s.email, success: false, error: 'createUser returned no user' })
      } else {
        results.push({ email: s.email, success: true, id: data.user.id })
        emailQueue.push({ name: s.full_name.trim(), email: s.email })
      }
    }

    // Generate a recovery link per successful create + send welcome email.
    // Recovery link is the activation token; replaces the previous flow of
    // emailing the teacher-set plaintext password (Finding 8 in the
    // security review). The teacher-set password still works as a fallback
    // if the student loses the email.
    if (resendKey && emailQueue.length > 0) {
      await Promise.allSettled(
        emailQueue.map(async ({ name, email }) => {
          const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
            type: 'recovery',
            email,
            options: { redirectTo: RESET_URL },
          })
          if (linkError || !linkData?.properties?.action_link) {
            console.error('Failed to generate recovery link for', email, linkError)
            return
          }
          try {
            await sendWelcomeEmail(name, email, linkData.properties.action_link, resendKey)
          } catch (err) {
            console.error('Welcome email failed for', email, err)
          }
        })
      )
    }

    return new Response(JSON.stringify({ results }), { status: 200, headers: corsHeaders })
  } catch (err) {
    console.error('create-student error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: corsHeaders,
    })
  }
})
