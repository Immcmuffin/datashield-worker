import { chromium, Browser, BrowserContext } from 'playwright'
import {
  claimJob,
  getSubscription,
  markJobRunning,
  markJobComplete,
  markJobFailed,
  AutomationJob,
  Subscription
} from './supabase'
import { removeFromSpokeo } from './brokers/spokeo'
import { removeFromWhitepages } from './brokers/whitepages'
import { removeFromFastPeopleSearch } from './brokers/fastpeoplesearch'
import { removeFromBrokerStub } from './brokers/stubs'

const WORKER_ID = `worker-${process.env.RAILWAY_REPLICA_ID || Math.random().toString(36).slice(2, 8)}`
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3')
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '5000')

let activeJobs = 0
let browser: Browser

async function runBrokerRemoval(job: AutomationJob, sub: Subscription): Promise<Record<string, unknown>> {
  const context: BrowserContext = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
  })
  const page = await context.newPage()

  try {
    switch (job.broker_name) {
      case 'Spokeo':
        return await removeFromSpokeo(page, sub)
      case 'Whitepages':
        return await removeFromWhitepages(page, sub)
      case 'FastPeopleSearch':
        return await removeFromFastPeopleSearch(page, sub)
      default:
        return await removeFromBrokerStub(page, sub, job.broker_name)
    }
  } finally {
    await context.close()
  }
}

async function processJob(job: AutomationJob) {
  activeJobs++
  console.log(`[${WORKER_ID}] Processing job ${job.id} → ${job.broker_name} (attempt ${job.attempts})`)

  try {
    await markJobRunning(job.id)

    const sub = await getSubscription(job.subscription_id)
    if (!sub) {
      await markJobFailed(job.id, 'Subscription not found', job.attempts, job.max_attempts)
      return
    }

    const result = await runBrokerRemoval(job, sub)
    await markJobComplete(job.id, result)
    console.log(`[${WORKER_ID}] ✅ Completed ${job.broker_name} for ${sub.subject_name}:`, result.status)

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[${WORKER_ID}] ❌ Failed ${job.broker_name}:`, message)
    await markJobFailed(job.id, message, job.attempts, job.max_attempts)
  } finally {
    activeJobs--
  }
}

async function poll() {
  if (activeJobs >= CONCURRENCY) return

  const job = await claimJob(WORKER_ID)
  if (!job) return

  // Don't await — run jobs concurrently up to CONCURRENCY limit
  processJob(job)
}

async function main() {
  console.log(`🚀 DataShield Worker starting — ID: ${WORKER_ID}, Concurrency: ${CONCURRENCY}`)

  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  })

  console.log('🌐 Browser launched')

  // Poll for jobs on an interval
  setInterval(poll, POLL_INTERVAL_MS)

  // Also poll immediately
  poll()

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down...')
    await browser.close()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
