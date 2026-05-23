import { Page } from 'playwright'
import { Subscription } from '../supabase'

export async function removeFromWhitepages(page: Page, sub: Subscription): Promise<Record<string, unknown>> {
  console.log(`[whitepages] Starting removal for ${sub.subject_name}`)

  await page.goto('https://www.whitepages.com/suppression-requests', { waitUntil: 'domcontentloaded', timeout: 30000 })

  const nameParts = sub.subject_name.trim().split(' ')
  const firstName = nameParts[0]
  const lastName = nameParts.slice(1).join(' ')

  // Fill name fields
  await page.fill('input[name="firstname"], input[placeholder*="First"]', firstName)
  await page.fill('input[name="lastname"], input[placeholder*="Last"]', lastName)

  if (sub.subject_city) {
    const cityInput = page.locator('input[name="city"], input[placeholder*="City"]')
    if (await cityInput.isVisible()) await cityInput.fill(sub.subject_city)
  }
  if (sub.subject_state) {
    const stateInput = page.locator('input[name="state"], select[name="state"]')
    if (await stateInput.isVisible()) await stateInput.fill(sub.subject_state)
  }

  await page.click('button[type="submit"], button:has-text("Search")')
  await page.waitForLoadState('domcontentloaded', { timeout: 20000 })

  // Click the opt-out link for matching result
  const optOutLink = page.locator('a:has-text("Remove me"), button:has-text("Remove"), a[href*="optout"]')
  if (await optOutLink.first().isVisible({ timeout: 8000 })) {
    await optOutLink.first().click()
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 })

    // Complete verification if needed
    const verifyBtn = page.locator('button:has-text("Verify"), button:has-text("Confirm"), button:has-text("Submit")')
    if (await verifyBtn.isVisible({ timeout: 5000 })) {
      await verifyBtn.click()
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 })
    }

    return { status: 'submitted', message: 'Removal request submitted to Whitepages', broker: 'Whitepages' }
  }

  return { status: 'not_found', message: 'No matching record found on Whitepages', broker: 'Whitepages' }
}
