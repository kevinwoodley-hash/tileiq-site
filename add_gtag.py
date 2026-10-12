"""Put TileIQ's analytics include straight after <head> on every page of the site — once per page.

The include loads /analytics.js, which holds the Google tag (GA4 G-274KES4P2G) behind Consent Mode v2,
the consent banner, the internal-testing flag and the app-store link tracking. Any older inline
Google tag for the same ID is removed first, so a page never carries two.

Usage: python3 add_gtag.py <file.html> ...
       (update-web-demo.sh runs it on app/index.html after copying the app over)"""
import re, sys

TAG_ID = "G-274KES4P2G"
SNIPPET = """<!-- TileIQ analytics: Google tag G-274KES4P2G with Consent Mode v2 (see /analytics.js) -->
<script src="/analytics.js"></script>"""
HEAD = re.compile(r"<head(\s[^>]*)?>", re.I)   # the real <head> tag, never <header>
# The old inline tag in each form it has had: optional comment, the gtag.js loader, then the inline
# script that configures it (which on app/index.html also carried demo-frame and store-click code).
OLD_TAG = re.compile(
    r"\n?(?:<!-- Google tag \(gtag\.js\) -->\s*)?"
    r"<script async src=\"https://www\.googletagmanager\.com/gtag/js\?id=" + TAG_ID + r"\"></script>\s*"
    r"<script>(?:(?!</script>).)*?gtag\('config',\s*'" + TAG_ID + r"'(?:(?!</script>).)*?</script>",
    re.S)

for path in sys.argv[1:]:
    if path == "--app":            # older callers passed this for app/index.html; one include serves every page now
        continue
    s = open(path, encoding="utf-8").read()
    had_old = bool(OLD_TAG.search(s))
    s2 = OLD_TAG.sub("", s)
    if SNIPPET in s2:
        if had_old:
            open(path, "w", encoding="utf-8", newline="").write(s2)
            print("removed old tag:", path)
        else:
            print("already has it:", path)
        continue
    if TAG_ID in s2:
        print("UNRECOGNISED TAG, left alone:", path); continue
    m = HEAD.search(s2)
    if not m:
        print("NO <head> FOUND:", path); continue
    s2 = s2[:m.end()] + "\n" + SNIPPET + s2[m.end():]
    open(path, "w", encoding="utf-8", newline="").write(s2)
    print(("replaced old tag: " if had_old else "added: ") + path)
