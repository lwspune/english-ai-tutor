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
  return {
    from: FROM_EMAIL,
    to: email,
    subject: 'Your English AI Tutor account is ready — set your password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1e293b">Hi ${name},</h2>
        <p style="color:#475569">Your English AI Tutor account has been set up for you.</p>
        <p style="color:#475569">Click the button below to set your password and start practising. The link is valid for 1 hour.</p>
        <a href="${actionLink}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0">
          Set Password &amp; Start →
        </a>
        <p style="color:#94a3b8;font-size:12px;margin-top:24px">Login email: ${email}</p>
        <p style="color:#94a3b8;font-size:12px">English AI Tutor · LWS Pune</p>
      </div>
    `,
  }
}

function buildReengagementEmail(name: string, email: string, lastAccuracy?: number) {
  const accuracyLine = lastAccuracy != null
    ? `<p style="color:#475569">Your last session accuracy was <strong>${lastAccuracy}%</strong> — keep the momentum going.</p>`
    : ''
  return {
    from: FROM_EMAIL,
    to: email,
    subject: 'Your reading practice is waiting',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1e293b">Hi ${name},</h2>
        <p style="color:#475569">It's been a few days since your last reading session.</p>
        ${accuracyLine}
        <a href="${SITE_URL}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0">
          Continue Practising →
        </a>
        <p style="color:#94a3b8;font-size:12px;margin-top:24px">English AI Tutor · LWS Pune</p>
      </div>
    `,
  }
}
