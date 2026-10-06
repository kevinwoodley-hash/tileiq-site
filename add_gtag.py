"""Add the Google tag straight after <head> on every page of the site — once per page; pages that already have it are left alone.
Usage: python3 add_gtag.py <file.html> ...
       python3 add_gtag.py --app app/index.html   (the web app's own variant — see APP_SNIPPET)"""
import re, sys

TAG_ID = "G-274KES4P2G"
LOADER = """<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-274KES4P2G"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
"""
SNIPPET = LOADER + """
  gtag('config', 'G-274KES4P2G');
</script>"""
# The web app. Inside the /app/demo wrapper (loaded in its iframe with ?demo=1) the wrapper page has
# already sent the visit's page_view, so the app doesn't send a second one — but GA4 stays configured,
# so gtag('event', 'demo_…') calls from the demo still go through (same origin, so same client/session).
# Opened any other way (including /app/?demo=1 on its own) it sends its page_view as normal.
APP_SNIPPET = LOADER + """
  // In the /app/demo wrapper the wrapper page sends the visit's page_view; GA4 stays on for demo_* events
  var tileiqDemoFrame = window.self !== window.top && new URLSearchParams(location.search).get('demo') === '1';
  gtag('config', 'G-274KES4P2G', tileiqDemoFrame ? { send_page_view: false } : {});
</script>"""
HEAD = re.compile(r"<head(\s[^>]*)?>", re.I)   # the real <head> tag, never <header>

args = sys.argv[1:]
app = "--app" in args
paths = [a for a in args if a != "--app"]
snippet = APP_SNIPPET if app else SNIPPET

for path in paths:
    s = open(path, encoding="utf-8").read()
    if snippet in s:
        print("already has it:", path); continue
    if TAG_ID in s:
        if app and SNIPPET in s:                    # upgrade the plain tag to the app's variant
            s = s.replace(SNIPPET, APP_SNIPPET, 1)
            open(path, "w", encoding="utf-8", newline="").write(s)
            print("switched to app tag:", path)
        else:
            print("already has it:", path)
        continue
    m = HEAD.search(s)
    if not m:
        print("NO <head> FOUND:", path); continue
    s = s[:m.end()] + "\n" + snippet + s[m.end():]
    open(path, "w", encoding="utf-8", newline="").write(s)
    print("added:", path)
