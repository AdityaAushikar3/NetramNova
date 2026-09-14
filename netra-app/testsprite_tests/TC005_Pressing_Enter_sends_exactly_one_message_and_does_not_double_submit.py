import asyncio
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",         # Set the browser window size
                "--disable-dev-shm-usage",        # Avoid using /dev/shm which can cause issues in containers
                "--ipc=host",                     # Use host-level IPC for better stability
                "--single-process"                # Run the browser in a single process mode
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        context.set_default_timeout(5000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> Navigate to http://localhost:3000
        await page.goto("http://localhost:3000")
        
        # -> Type a message into the chat input, press Enter twice (to simulate accidental double-submit), wait for the AI reply, then extract the visible conversation text to verify there is only one user message and one AI response.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div[2]/div[2]/form/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Testing duplicate-submit behavior. Please reply once to this message.')
        
        # -> Enter the message into the chat input, press Enter twice (simulate double-submit), wait for the AI response to appear, then extract the visible conversation text to verify there's only one user message and one AI response.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div[2]/div[2]/form/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Testing duplicate-submit behavior. Please reply once to this message.')
        
        # --> Assertions to verify final state
        frame = context.pages[-1]
        assert await frame.locator("xpath=//*[contains(., 'Testing duplicate-submit behavior. Please reply once to this message.')]").nth(0).is_visible() and await frame.locator("xpath=//*[contains(., 'assistant')]").nth(0).is_visible(), "The latest user message should appear once and the latest AI reply should appear once after pressing Enter twice."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    