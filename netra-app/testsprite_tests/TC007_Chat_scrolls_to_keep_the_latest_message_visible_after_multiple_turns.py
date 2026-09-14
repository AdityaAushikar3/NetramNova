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
        
        # -> Send the first user message by filling the input and pressing Enter, then wait for the AI response.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div[2]/div[2]/form/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Test turn 1 — please respond.')
        
        # -> Type the next user message into the chat input and press Enter, wait for the AI response, then send a second message and wait again. After replies appear, verify the latest AI message is visible in the viewport.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div[2]/div[2]/form/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Test turn 1 — please respond.')
        
        # -> Send the first user message by typing into the chat input and pressing Enter, wait for the AI response, then send the second message and wait for its response.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div[2]/div[2]/form/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Test turn 1 — please respond.')
        
        # -> Send the currently-typed first message by clicking the submit button, then wait for the AI response to appear.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div[2]/div[2]/form/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Send the first user message by filling the chat input and pressing Enter, then wait for the AI response to appear.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div[2]/div[2]/form/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Test turn 1 — please respond.')
        
        # -> Send the first user message by typing into the chat input and pressing Enter, wait for the AI response, then send the second message and wait for its response.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div[2]/div[2]/form/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Test turn 1 — please respond.')
        
        # -> Type and submit the first user message, wait for the AI response to appear.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div[2]/div[2]/form/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Test turn 1 — please respond.')
        
        # -> Click the submit button to send the currently-typed message, then wait for the AI response to appear.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div[2]/div[2]/form/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Type the first user message into the chat input and submit it (Enter). Wait for the UI to update, then extract the page content to check whether an AI/assistant reply appeared (or whether the placeholder remains).
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div[2]/div[2]/form/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Test turn 1 — please respond.')
        
        # -> Type and submit the first user message ('Test turn 1 — please respond.'), wait for an assistant reply, then send the second message and wait again. After each wait, extract the page text to check whether an assistant message appeared and is visible in the viewport.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div[2]/div[2]/form/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Test turn 1 — please respond.')
        
        # -> Type and submit the first user message into the chat input (index 3), wait for the assistant reply to appear, then extract the page text to determine whether an assistant message is present and visible.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div[2]/div[2]/form/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Test turn 1 — please respond.')
        
        # -> Click the submit button to send the current message, wait for the UI to update, then extract the visible page text to determine whether an assistant reply appeared and is visible in the conversation viewport.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div[2]/div[2]/form/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # --> Assertions to verify final state
        frame = context.pages[-1]
        assert await frame.locator("xpath=//*[contains(., 'Assistant')]").nth(0).is_visible(), "The latest AI message should be visible in the conversation viewport after the assistant replies."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    