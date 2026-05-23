import { Page } from 'playwright'
import { Subscription } from '../supabase'

// Opt-out URLs for each broker
const BROKER_OPTOUT_URLS: Record<string, string> = {
  'BeenVerified': 'https://www.beenverified.com/app/optout/search',
  'Intelius': 'https://www.intelius.com/opt-out',
  'PeopleFinder': 'https://www.peoplefinder.com/optout.php',
  'Radaris': 'https://radaris.com/page/how-to-remove',
  'MyLife': 'https://www.mylife.com/privacy/remove-my-information.pubview',
  'TruthFinder': 'https://www.truthfinder.com/opt-out/',
  'Instant Checkmate': 'https://www.instantcheckmate.com/opt-out/',
  'ZabaSearch': 'https://www.zabasearch.com/block_records/',
  'PeekYou': 'https://www.peekyou.com/about/contact/optout/',
  'Pipl': 'https://pipl.com/personal-information-removal-request',
  'AnyWho': 'https://www.anywho.com/help/privacy',
  'USSearch': 'https://www.ussearch.com/consumer/optout/landing.do',
  'PublicRecordsNow': 'https://www.publicrecordsnow.com/static/view/optout',
  'InfoTracer': 'https://infotracer.com/optout/',
  'Clustrmaps': 'https://clustrmaps.com/bl/opt-out',
  'Nuwber': 'https://nuwber.com/removal/link',
  'Addresses': 'https://www.addresses.com/optout.php',
}

export async function removeFromBrokerStub(
  page: Page,
  sub: Subscription,
  brokerName: string
): Promise<Record<string, unknown>> {
  console.log(`[${brokerName.toLowerCase()}] Starting removal for ${sub.subject_name}`)

  const optOutUrl = BROKER_OPTOUT_URLS[brokerName]
  if (!optOutUrl) {
    return { status: 'skipped', message: `No opt-out URL configured for ${brokerName}`, broker: brokerName }
  }

  try {
    await page.goto(optOutUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })

    const nameParts = sub.subject_name.trim().split(' ')
    const firstName = nameParts[0]
    const lastName = nameParts.slice(1).join(' ')

    // Try to fill common form fields
    const firstNameInput = page.locator('input[name="firstName"], input[name="first_name"], input[placeholder*="First"]').first()
    if (await firstNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstNameInput.fill(firstName)
    }

    const lastNameInput = page.locator('input[name="lastName"], input[name="last_name"], input[placeholder*="Last"]').first()
    if (await lastNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await lastNameInput.fill(lastName)
    }

    const emailInput = page.locator('input[type="email"]').first()
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailInput.fill(sub.subject_email)
    }

    const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first()
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click()
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {})
    }

    return {
      status: 'submitted',
      message: `Opt-out page visited and form submitted for ${brokerName}`,
      broker: brokerName,
      url: optOutUrl
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      status: 'error',
      message: `Error during removal from ${brokerName}: ${message}`,
      broker: brokerName
    }
  }
}
