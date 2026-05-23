import { Page } from 'playwright'
import { Subscription, getSecret } from '../supabase'

interface CaptchaResponse {
  status: number
  request: string
}

async function solveCaptcha(page: Page, apiKey: string): Promise<boolean> {
  // Get the reCAPTCHA site key from the page
  const siteKey = await page.evaluate(() => {
    const el = document.querySelector('.g-recaptcha, [data-sitekey]')
    return el?.getAttribute('data-sitekey') || null
  })

  if (!siteKey) {
    console.log('[spokeo] No CAPTCHA found on page, proceeding without solving')
    return true
  }

  const pageUrl = page.url()
  console.log(`[spokeo] Solving reCAPTCHA with site key: ${siteKey.slice(0, 20)}...`)

  // Submit CAPTCHA to 2Captcha
  const submitRes = await fetch(
    `https://2captcha.com/in.php?key=${apiKey}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${encodeURIComponent(pageUrl)}&json=1`
  )
  const submitData = await submitRes.json() as CaptchaResponse

  if (submitData.status !== 1) {
    console.error('[spokeo] 2Captcha submission failed:', submitData)
    return false
  }

  const taskId = submitData.request
  console.log(`[spokeo] CAPTCHA task ID: ${taskId}, polling...`)

  // Poll for result (up to 2 minutes)
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const pollRes = await fetch(
      `https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`
    )
    const pollData = await pollRes.json() as CaptchaResponse

    if (pollData.status === 1) {
      const token = pollData.request
      console.log('[spokeo] CAPTCHA solved!')

      // Inject the token into the page
      await page.evaluate((t) => {
        const textarea = document.querySelector('#g-recaptcha-response') as HTMLTextAreaElement
        if (textarea) {
          textarea.style.display = 'block'
          textarea.value = t
        }
        // Also try callback
        const el = document.querySelector('.g-recaptcha') as HTMLElement
        const callback = el?.getAttribute('data-callback')
        if (callback && (window as any)[callback]) {
          (window as any)[callback](t)
        }
      }, token)
      return true
    }

    if (pollData.request !== 'CAPCHA_NOT_READY') {
      console.error('[spokeo] 2Captcha error:', pollData)
      return false
    }
  }

  console.error('[spokeo] CAPTCHA solving timed out')
  return false
}

export async function removeFromSpokeo(page: Page, sub: Subscription): Promise<Record<string, unknown>> {
  console.log(`[spokeo] Starting removal for ${sub.subject_name}`)

  const apiKey = await getSecret('twocaptcha_api_key')
  const nameParts = sub.subject_name.trim().split(' ')
  const firstName = nameParts[0]
  const lastName = nameParts.slice(1).join(' ')

  // Step 1: Search for the profile to get the URL
  await page.goto('https://www.spokeo.com/search', { waitUntil: 'domcontentloaded', timeout: 30000 })

  // Try to find a matching profile via search
  const searchUrl = `https://www.spokeo.com/${encodeURIComponent(firstName)}-${encodeURIComponent(lastName)}` +
    (sub.subject_state ? `?state=${sub.subject_state.toLowerCase()}` : '')

  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)

  // Get the first matching profile URL
  let profileUrl: string | null = null

  const profileLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/search/"]'))
    return links
      .map(a => (a as HTMLAnchorElement).href)
      .filter(href => href.includes('/search/') && !href.includes('?'))
      .slice(0, 3)
  })

  if (profileLinks.length > 0) {
    profileUrl = profileLinks[0]
    console.log(`[spokeo] Found profile URL: ${profileUrl}`)
  } else {
    // Try the people search results
    const resultLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a.name-link, a.result-link, [data-testid="result-link"]'))
      return links.map(a => (a as HTMLAnchorElement).href).slice(0, 3)
    })
    if (resultLinks.length > 0) profileUrl = resultLinks[0]
  }

  // Step 2: Go to opt-out page with the profile URL (or just the optout page)
  await page.goto('https://www.spokeo.com/optout', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)

  // Step 3: Fill in the profile URL field
  const urlInput = page.locator('input[name="url"], input[placeholder*="spokeo.com"], input[type="url"], #optout-url').first()
  if (await urlInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await urlInput.fill(profileUrl || `https://www.spokeo.com/${firstName}-${lastName}`)
  } else {
    // Try text input
    const textInput = page.locator('input[type="text"]').first()
    if (await textInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await textInput.fill(profileUrl || `https://www.spokeo.com/${firstName}-${lastName}`)
    }
  }

  // Step 4: Fill email
  const emailInput = page.locator('input[type="email"], input[name="email"]').first()
  if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await emailInput.fill(sub.subject_email)
  }

  // Step 5: Solve CAPTCHA if present and API key available
  if (apiKey) {
    await solveCaptcha(page, apiKey)
    await page.waitForTimeout(1000)
  }

  // Step 6: Submit
  const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Opt Out"), button:has-text("Remove"), button:has-text("Submit")').first()
  if (await submitBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await submitBtn.click()
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {})
  }

  return {
    status: 'submitted',
    message: profileUrl
      ? `Opt-out submitted for profile: ${profileUrl}`
      : 'Opt-out form submitted to Spokeo (profile search fallback used)',
    broker: 'Spokeo',
    profileUrl: profileUrl || null
  }
}
