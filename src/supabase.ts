import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
})

export interface AutomationJob {
  id: string
  subscription_id: string
  user_id: string
  broker_name: string
  broker_url: string | null
  status: string
  attempts: number
  max_attempts: number
  claimed_by: string | null
  result: Record<string, unknown> | null
  error_message: string | null
}

export interface Subscription {
  id: string
  subject_name: string
  subject_email: string
  subject_city: string
  subject_state: string
}

export async function claimJob(workerId: string): Promise<AutomationJob | null> {
  const { data, error } = await supabase.rpc('claim_automation_job', {
    p_worker_id: workerId
  })
  if (error) {
    console.error('[supabase] claim error:', error.message)
    return null
  }
  return data?.[0] ?? null
}

export async function getSubscription(subscriptionId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .schema('ds')
    .from('subscriptions')
    .select('id, subject_name, subject_email, subject_city, subject_state')
    .eq('id', subscriptionId)
    .single()
  if (error) return null
  return data
}

export async function markJobRunning(jobId: string) {
  await supabase.schema('ds').from('automation_jobs').update({
    status: 'running',
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq('id', jobId)
}

export async function markJobComplete(jobId: string, result: Record<string, unknown>) {
  await supabase.schema('ds').from('automation_jobs').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    result,
    updated_at: new Date().toISOString()
  }).eq('id', jobId)
}

export async function markJobFailed(jobId: string, errorMessage: string, attempts: number, maxAttempts: number) {
  const shouldRetry = attempts < maxAttempts
  await supabase.schema('ds').from('automation_jobs').update({
    status: shouldRetry ? 'pending' : 'failed',
    error_message: errorMessage,
    next_run_at: shouldRetry
      ? new Date(Date.now() + Math.pow(2, attempts) * 60000).toISOString()
      : null,
    updated_at: new Date().toISOString()
  }).eq('id', jobId)
}
