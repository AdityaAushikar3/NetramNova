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
        
        # -> Fill the chat input with a test message and submit it (press Enter) so the UI produces a user message and an AI reply.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div[2]/div[2]/form/input').nth(0)
        await asyncio.sleep(3); await elem.fill('This is a test message to check ordering.')
        
        # -> Fill the chat input with the test message and submit it (press Enter), then wait for the AI response to appear so we can verify message ordering.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div[2]/div[2]/form/input').nth(0)
        await asyncio.sleep(3); await elem.fill('This is a test message to check ordering.')
        
        # -> Focus the input field, enter the test message, submit using Control+Enter, wait a few seconds for the UI to update, then check for message elements and their order.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div[2]/div[2]/form/input').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div[2]/div[2]/form/input').nth(0)
        await asyncio.sleep(3); await elem.fill('This is a test message to check ordering.')
        
        # -> Click the submit button (index 42) to send the message, wait for the UI to update, then extract the visible chat messages in top-to-bottom order to verify that the user message appears immediately before the AI reply.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div[2]/div[2]/form/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # --> Assertions to verify final state
        frame = context.pages[-1]
        assert await frame.locator("xpath=//*[contains(., 'This is a test message to check ordering.')]/following-sibling::*[1]").nth(0).is_visible(), "The most recent user message should appear immediately before the most recent AI reply in the thread"
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    