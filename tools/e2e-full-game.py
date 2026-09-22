"""Full-game production probe: play until terminal with random legal human moves."""
import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else "https://yuubinnkyoku.github.io/kyouen-game/"
seed = int(sys.argv[2]) if len(sys.argv) > 2 else 7
rng = seed
fetched = []


def rand(n):
    global rng
    rng = (rng * 1103515245 + 12345) & 0x7FFFFFFF
    return rng % n


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.on("response", lambda r: fetched.append(r.url) if r.url.endswith(".bin") and "strategy" in r.url else None)
    pg.goto(url, wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(2000)
    moves = 0
    for _ in range(60):
        if pg.locator("#endOverlay").is_visible():
            break
        # pick a random empty legal-looking cell via page JS
        idx = pg.evaluate(
            """() => {
              const cells = [...document.querySelectorAll('.cell')];
              const free = cells.map((c,i)=>i).filter(i => !cells[i].classList.contains('cpu') && !cells[i].classList.contains('you') && !cells[i].disabled);
              if (!free.length) return -1;
              return free[Math.floor(Math.random()*free.length)];
            }"""
        )
        if idx == -1:
            break
        pg.locator(".cell").nth(idx).click()
        moves += 1
        try:
            pg.wait_for_function(
                "() => !document.querySelector('#resetBtn').disabled",
                timeout=15000,
            )
        except Exception:
            pass
        pg.wait_for_timeout(400)
    print("human moves:", moves)
    print("cpu stones:", pg.locator(".cell.cpu").count(), "you stones:", pg.locator(".cell.you").count())
    print("turn:", pg.locator("#turnLabel").inner_text())
    print("end visible:", pg.locator("#endOverlay").is_visible())
    if pg.locator("#endOverlay").is_visible():
        print("end title:", pg.locator("#endTitle").inner_text())
    print("strategy shards fetched:", len(set(fetched)))
    total = pg.evaluate("() => document.querySelector('#dFetch').textContent")
    print("fetch detail:", total)
    print("pageerrors:", errs if errs else "none")
    b.close()
