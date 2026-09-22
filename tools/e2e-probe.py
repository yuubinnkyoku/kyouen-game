"""Probe the dev page with Playwright and dump console errors + fetch statuses."""
import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173/kyouen-game/"
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    msgs = []
    pg.on("console", lambda m: msgs.append(f"{m.type}: {m.text[:300]}"))
    pg.on("pageerror", lambda e: msgs.append(f"pageerror: {str(e)[:300]}"))
    pg.on("response", lambda r: msgs.append(f"resp {r.status} {r.url[-80:]}") if r.status >= 400 else None)
    pg.goto(url, wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(4000)
    print("cells:", pg.locator(".cell").count())
    print("turn:", pg.locator("#turnLabel").inner_text())
    print("fetch:", pg.locator("#fetchLabel").inner_text() if pg.locator("#fetchLabel").is_visible() else "(hidden)")
    print("--- console/net ---")
    for m in msgs[:40]:
        print(m)
    b.close()
