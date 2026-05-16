import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SITE_URL   = 'https://english-ai-tutor-mauve.vercel.app'
const RESET_URL  = `${SITE_URL}/reset-password`
const FROM_EMAIL = 'tutor@lwspune.in'

// Mirrors src/lib/reminders.js — same logic, kept here to avoid cross-runtime imports
const REMINDER_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000
const MIN_ACCOUNT_AGE_MS   = 2 * 24 * 60 * 60 * 1000

function buildReminderList(users: any[], profiles: any[], sessions: any[], now: number) {
  const profileMap = new Map(profiles.map((p: any) => [p.id, p]))
  const latestSession = new Map<string, any>()
  for (const s of sessions) {
    if (!latestSession.has(s.student_id)) latestSession.set(s.student_id, s)
  }
  const toRemind: any[] = []
  for (const user of users) {
    const profile = profileMap.get(user.id)
    if (!profile || !user.email) continue
    const lastReminder = profile.last_reminder_sent ? new Date(profile.last_reminder_sent).getTime() : 0
    if (now - lastReminder < REMINDER_INTERVAL_MS) continue
    const session = latestSession.get(user.id)
    const accountAge = now - new Date(user.created_at).getTime()
    if (!session) {
      if (accountAge >= MIN_ACCOUNT_AGE_MS) {
        toRemind.push({ id: user.id, name: profile.full_name, email: user.email, type: 'activation' })
      }
    } else {
      const lastSessionAge = now - new Date(session.created_at).getTime()
      if (lastSessionAge >= REMINDER_INTERVAL_MS) {
        toRemind.push({ id: user.id, name: profile.full_name, email: user.email, type: 'reengagement', lastAccuracy: session.score_accuracy })
      }
    }
  }
  return toRemind
}

Deno.serve(async (req) => {
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: settings } = await adminClient
    .from('app_settings').select('cron_secret').eq('id', true).single()

  if (!settings?.cron_secret || req.headers.get('x-cron-secret') !== settings.cron_secret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not set' }), { status: 500 })
  }

  // test_mode bypasses cohort selection and sends one of each template to a
  // single target email — for verifying copy/deliverability without waiting
  // for the next cron run. Same cron_secret auth above.
  let body: any = {}
  try { body = await req.json() } catch { /* GET / empty body — cron path */ }
  if (body?.test_mode === true) {
    if (!body.email || typeof body.email !== 'string') {
      return new Response(JSON.stringify({ error: 'test_mode requires { email }' }), { status: 400 })
    }
    const testName = body.name ?? 'Test Student'
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email: body.email,
      options: { redirectTo: RESET_URL },
    })
    const actionLink = linkData?.properties?.action_link ?? `${SITE_URL}/reset-password`
    const previews = [
      buildActivationEmail(testName, body.email, actionLink),
      buildReengagementEmail(testName, body.email, body.lastAccuracy ?? 87),
    ]
    const results: any[] = []
    for (const payload of previews) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      results.push({ subject: payload.subject, status: res.status, body: res.ok ? null : await res.text() })
    }
    return new Response(JSON.stringify({ test_mode: true, results, linkError: linkError?.message ?? null }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const now = Date.now()
  const [{ data: { users } }, { data: profiles }, { data: sessions }] = await Promise.all([
    adminClient.auth.admin.listUsers({ perPage: 1000 }),
    adminClient.from('profiles').select('id, full_name, last_reminder_sent').eq('role', 'student'),
    adminClient.from('sessions').select('student_id, created_at, score_accuracy').order('created_at', { ascending: false }),
  ])

  const toRemind = buildReminderList(users, profiles ?? [], sessions ?? [], now)

  let sent = 0
  let failed = 0
  const sentIds: string[] = []

  // Resend free tier is 2 req/sec. The send loop hits that ceiling in tight
  // bursts, so we throttle between Resend POSTs. The first iteration has no
  // prior send to space from, so we only sleep before iterations after the
  // first.
  let isFirst = true
  for (const student of toRemind) {
    let emailPayload

    if (student.type === 'activation') {
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email: student.email,
        options: { redirectTo: RESET_URL },
      })
      if (linkError || !linkData?.properties?.action_link) {
        console.error('Failed to generate recovery link for', student.email, linkError)
        failed++
        continue
      }
      emailPayload = buildActivationEmail(student.name, student.email, linkData.properties.action_link)
    } else {
      emailPayload = buildReengagementEmail(student.name, student.email, student.lastAccuracy)
    }

    if (!isFirst) {
      await new Promise(r => setTimeout(r, 600))
    }
    isFirst = false

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload),
    })

    if (res.ok) {
      sent++
      sentIds.push(student.id)
    } else {
      failed++
      console.error('Reminder failed for', student.email, await res.text())
    }
  }

  if (sentIds.length > 0) {
    await adminClient.from('profiles')
      .update({ last_reminder_sent: new Date().toISOString() })
      .in('id', sentIds)
  }

  console.log(`send-reminders: sent=${sent} failed=${failed} total=${toRemind.length}`)
  return new Response(JSON.stringify({ sent, failed, total: toRemind.length }), { status: 200 })
})

function buildActivationEmail(name: string, email: string, actionLink: string) {
  const text = `Hi ${name},

This is the reading practice tool your batch is using in Pune. Your account
is set up — log in once to set your password, then try a short passage.

Each session takes 2-3 minutes. You read a passage aloud, the app scores
your accuracy and pronunciation, and tells you what to fix next time.

Try your first passage (link valid for 1 hour):
${actionLink}

-- English AI Tutor, LWS Pune
Login email: ${email}
Reply to this email if you can't log in.`

  return {
    from: FROM_EMAIL,
    to: email,
    subject: `Try your first passage, ${name} — 2 minutes`,
    text,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#334155;line-height:1.55">
  <p>Hi ${name},</p>
  <p>This is the reading practice tool your batch is using in Pune. Your account is set up — log in once to set your password, then try a short passage.</p>
  <p>Each session takes 2–3 minutes. You read a passage aloud, the app scores your accuracy and pronunciation, and tells you what to fix next time.</p>
  <p style="margin:20px 0">
    <a href="${actionLink}" style="background:#4f46e5;color:#ffffff;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Try your first passage</a>
  </p>
  <p style="color:#64748b;font-size:13px">Link is valid for 1 hour.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="color:#64748b;font-size:12px;margin:4px 0">English AI Tutor · LWS Pune</p>
  <p style="color:#64748b;font-size:12px;margin:4px 0">Login email: ${email}</p>
  <p style="color:#64748b;font-size:12px;margin:4px 0">Reply to this email if you can't log in.</p>
</div>`,
  }
}

function buildReengagementEmail(name: string, email: string, lastAccuracy?: number) {
  const hasScore = lastAccuracy != null
  const subject = hasScore
    ? `${lastAccuracy}% last time, ${name} — push it higher?`
    : `A new passage is waiting, ${name}`
  const scoreLine = hasScore
    ? `Your last reading session scored ${lastAccuracy}%.`
    : `It's been a few days since your last reading session.`

  const text = `Hi ${name},

${scoreLine}

A new passage takes 2-3 minutes. Try one today:
${SITE_URL}

-- English AI Tutor, LWS Pune
Reply to this email if you need help.`

  return {
    from: FROM_EMAIL,
    to: email,
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#334155;line-height:1.55">
  <p>Hi ${name},</p>
  <p>${scoreLine}</p>
  <p>A new passage takes 2–3 minutes.</p>
  <p style="margin:20px 0">
    <a href="${SITE_URL}" style="background:#4f46e5;color:#ffffff;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Try a new passage</a>
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="color:#64748b;font-size:12px;margin:4px 0">English AI Tutor · LWS Pune</p>
  <p style="color:#64748b;font-size:12px;margin:4px 0">Reply to this email if you need help.</p>
</div>`,
  }
}
