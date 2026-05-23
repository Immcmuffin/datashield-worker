import { Page } from 'playwright'
import { Subscription } from '../supabase'

export async function removeFromFastPeopleSearch(page: Page, sub: Subscription): Promise<Record<string, unknown>> {
  console.log(`[fastpeoplesearch] Starting removal for ${sub.subject_name}`)

  const nameParts = sub.subject_name.trim().split(' ')
  const firstName = nameParts[0].toLowerCase()
  const lastName = nameParts.slice(1).join('-').toLowerCase()
  const city = sub.subject_city?.toLowerCase().replace(/\s+/g, '-') || ''
  const state = sub.subject_state?.toLowerCase() || ''

  // FastPeopleSearch uses URL-based search
  const searchUrl = `https://www.fastpeoplesearch.com/name/${firstName}-${lastName}_${city}-${state}`
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })

  // Find the remove link
  const removeLink = page.locator('a:has-text("Remove My Info"), a:has-text("Opt Out"), a[href*="optout"], a[href*="remove"]')
  if (await removeLink.first().isVisible({ timeout: 8000 })) {
    const href = await removeLink.first().getAttribute('href')
    if (href) {
      await page.goto(href.startsWith('http') ? href : `https://www.fastpeoplesearch.com${href}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    } else {
      await removeLink.first().click()
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
    }

    // Submit the opt-out form
    const emailInput = page.locator('input[type="email"]')
    if (await emailInput.isVisible({ timeout: 5000 })) {
      await emailInput.fill(sub.subject_email)
    }

    const submitBtn = page.locator('button[type="submit"], button:has-text("Submit"), button:has-text("Remove")')
    if (await submitBtn.first().isVisible({ timeout: 5000 })) {
      await submitBtn.first().click()
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 })
    }

    return { status: 'submitted', message: 'Removal request submitted to FastPeopleSearch', broker: 'FastPeopleSearch' }
  }

  return { status: 'not_found', message: 'No matching record found on FastPeopleSearch', broker: 'FastPeopleSearch' }
}
