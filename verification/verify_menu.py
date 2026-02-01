from playwright.sync_api import sync_playwright, expect

def verify_menu():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            print("Navigating to home page...")
            page.goto("http://localhost:3000/editor")

            # Wait for content
            page.wait_for_selector("text=Spritesheet Creator")

            print("Checking for View menu button...")
            # Using get_by_role to confirm it's a button now
            view_btn = page.get_by_role("button", name="View", exact=True)
            expect(view_btn).to_be_visible()

            # Check aria attributes
            print("Checking ARIA attributes...")
            has_popup = view_btn.get_attribute("aria-haspopup")
            expanded_before = view_btn.get_attribute("aria-expanded")
            print(f"aria-haspopup: {has_popup}")
            print(f"aria-expanded (before): {expanded_before}")

            if has_popup != "true":
                print("FAIL: aria-haspopup missing or wrong")
            if expanded_before != "false":
                print("FAIL: aria-expanded should be false initially")

            # Click to open
            print("Clicking View menu...")
            view_btn.click()

            # Check if expanded
            expanded_after = view_btn.get_attribute("aria-expanded")
            print(f"aria-expanded (after): {expanded_after}")
            if expanded_after != "true":
                print("FAIL: aria-expanded should be true after click")

            # Check if dropdown is visible
            dropdown = page.locator("#view-menu-dropdown")
            expect(dropdown).to_be_visible()

            # Check items inside are buttons
            print("Checking dropdown items are buttons...")
            reset_btn = page.get_by_role("button", name="Reset Layout")
            expect(reset_btn).to_be_visible()

            # Take screenshot
            print("Taking screenshot...")
            page.screenshot(path="verification/menu_open.png")
            print("Screenshot saved to verification/menu_open.png")

        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_menu()
