import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_GRADES = new Set(['9', '10', '11', '12', 'MBA'])

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

    // Verify caller is a teacher
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

    const results = []
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
        results.push({ email: s.email, success: false, error: error.message })
      } else {
        results.push({ email: s.email, success: true, id: data.user.id })
      }
    }

    return new Response(JSON.stringify({ results }), { status: 200, headers: corsHeaders })
  } catch (err) {
    console.error('create-student error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: corsHeaders,
    })
  }
})
