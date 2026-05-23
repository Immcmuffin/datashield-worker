import * as WS from 'ws'
;(global as any).WebSocket = WS.WebSocket ?? WS

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
  const { data, error } = await supabase.rpc('claim_automation_job', { p_worker_id: workerId })
  if (error) { console.error('[supabase] claim error:', error.message); return null }
  return data?.[0] ?? null
}

export async function getSubscription(subscriptionId: string): Promise<Subscription | null> {
  const { data, error } = await supabase.rpc('get_subscription', { p_subscription_id: subscriptionId })
  if (error) { console.error('[supabase] getSubscription error:', error.message); return null }
  return data?.[0] ?? null
}

export async function getSecret(name: string): Promise<string | null> {
  const { data } = await supabase.rpc('get_secret', { p_name: name })
  return data ?? null
}

export async function markJobRunning(jobId: string) {
  const { error } = await supabase.rpc('mark_job_running', { p_job_id: jobId })
  if (error) console.error('[supabase] markJobRunning error:', error.message)
}

export async function markJobComplete(jobId: string, result: Record<string, unknown>) {
  const { error } = await supabase.rpc('mark_job_complete', { p_job_id: jobId, p_result: result })
  if (error) console.error('[supabase] markJobComplete error:', error.message)
}

export async function markJobFailed(jobId: string, errorMessage: string, attempts: number, maxAttempts: number) {
  const { error } = await supabase.rpc('mark_job_failed', {
    p_job_id: jobId, p_error: errorMessage, p_attempts: attempts, p_max_attempts: maxAttempts
  })
  if (error) console.error('[supabase] markJobFailed error:', error.message)
}
