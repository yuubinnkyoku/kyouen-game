"""Full-game probe: play one human move via page JS and report CPU reply + fetches."""
import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173/kyouen-game/"
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    fetched = []
    pg.on("response", lambda r: fetched.append(r.url) if r.url.endswith(".bin") else None)
    pg.goto(url, wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(2000)
    print("cells:", pg.locator(".cell").count())
    print("cpu stones:", pg.locator(".cell.cpu").count())
    pg.locator(".cell").nth(0).click()
    pg.wait_for_function(
        "() => document.querySelectorAll('.cell.cpu').length === 2",
        timeout=30000,
    )
    print("after 1 human move: cpu =", pg.locator(".cell.cpu").count(), "you =", pg.locator(".cell.you").count())
    print("turn:", pg.locator("#turnLabel").inner_text())
    print("shard fetch count:", len(fetched))
    for u in fetched[:5]:
        print("  fetched:", u[-24:])
    info = pg.evaluate("() => ({canon: document.querySelector('#dCanon').textContent, shard: document.querySelector('#dShard').textContent, fetch: document.querySelector('#dFetch').textContent})")
    print("detail:", info)
    print("pageerrors:", errs if errs else "none")
    b.close()
