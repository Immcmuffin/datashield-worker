import { Page } from 'playwright'
import { Subscription } from '../supabase'

export async function removeFromSpokeo(page: Page, sub: Subscription): Promise<Record<string, unknown>> {
  console.log(`[spokeo] Starting removal for ${sub.subject_name}`)

  // Step 1: Search for the person
  await page.goto('https://www.spokeo.com/optout', { waitUntil: 'domcontentloaded', timeout: 30000 })

  // Fill search form
  const nameParts = sub.subject_name.trim().split(' ')
  const firstName = nameParts[0]
  const lastName = nameParts.slice(1).join(' ')

  await page.fill('input[name="firstName"], input[placeholder*="First"]', firstName)
  await page.fill('input[name="lastName"], input[placeholder*="Last"]', lastName)

  if (sub.subject_state) {
    const stateSelect = page.locator('select[name="state"]')
    if (await stateSelect.isVisible()) {
      await stateSelect.selectOption(sub.subject_state)
    }
  }

  await page.click('button[type="submit"], button:has-text("Search"), input[type="submit"]')
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 })

  // Step 2: Find matching result and click remove
  const removeBtn = page.locator('a:has-text("Remove"), button:has-text("Remove My Info"), a:has-text("Opt Out")')
  if (await removeBtn.first().isVisible({ timeout: 8000 })) {
    await removeBtn.first().click()
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 })

    // Step 3: Enter email for confirmation
    const emailInput = page.locator('input[type="email"], input[name="email"]')
    if (await emailInput.isVisible({ timeout: 5000 })) {
      await emailInput.fill(sub.subject_email)
      await page.click('button[type="submit"], button:has-text("Submit"), button:has-text("Send")')
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 })
    }

    return { status: 'submitted', message: 'Opt-out submitted, confirmation email sent', broker: 'Spokeo' }
  }

  return { status: 'not_found', message: 'No matching record found on Spokeo', broker: 'Spokeo' }
}
