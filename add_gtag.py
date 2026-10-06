"""Add the Google tag straight after <head> on every page of the site — once per page; pages that already have it are left alone.
Usage: python3 add_gtag.py <file.html> ...   (prints what it did for each file)"""
import re, sys

TAG_ID = "G-274KES4P2G"
SNIPPET = """<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-274KES4P2G"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-274KES4P2G');
</script>"""
HEAD = re.compile(r"<head(\s[^>]*)?>", re.I)   # the real <head> tag, never <header>

for path in sys.argv[1:]:
    s = open(path, encoding="utf-8").read()
    if TAG_ID in s:
        print("already has it:", path); continue
    m = HEAD.search(s)
    if not m:
        print("NO <head> FOUND:", path); continue
    s = s[:m.end()] + "\n" + SNIPPET + s[m.end():]
    open(path, "w", encoding="utf-8", newline="").write(s)
    print("added:", path)
