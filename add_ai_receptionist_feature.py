#!/usr/bin/env python3
"""
Run from ~/tileiq-site/ with: python3 add_ai_receptionist_feature.py
Adds an AI Receptionist feature block to the features page, matching
the existing feature-block pattern.
"""

import io
import os

BASE = os.path.expanduser("~/tileiq-site")
TARGET = "features/index.html"

ANCHOR = '''    <!-- 2. Laser Measure -->
    <div class="feature-block flip">'''

NEW_BLOCK = '''    <!-- AI Receptionist -->
    <div class="feature-block">
      <div class="feature-copy">
        <div class="feat-eyebrow">Never Miss a Job</div>
        <h2>AI Receptionist</h2>
        <p>Miss a call, miss a job. When you can't pick up, your AI receptionist answers instantly, takes down what the customer needs, and adds it straight into your app as a new enquiry — no missed calls, no chasing voicemails.</p>
        <div class="feat-bullets">
          <div class="feat-bullet">Works on your existing mobile number — just divert missed calls</div>
          <div class="feat-bullet">Answers questions about your business using info from your own website</div>
          <div class="feat-bullet">Captures caller name, job details, tile spec and location automatically</div>
          <div class="feat-bullet">Listen back to the actual recorded message anytime</div>
        </div>
      </div>
      <div class="feature-visual">
        <div class="vis-card">
          <div class="vis-tag">\U0001F4DE AI Enquiry</div>
          <div class="mock-row"><span class="mock-label">Caller</span><span class="mock-val">Sarah Thompson</span></div>
          <div class="mock-row"><span class="mock-label">Job</span><span class="mock-val">Bathroom floor</span></div>
          <div class="mock-row"><span class="mock-label">Area</span><span class="mock-val">22 m\u00b2</span></div>
          <div style="height:1px;background:var(--slate-mid);margin:12px 0"></div>
          <div class="mock-row"><span class="mock-label">Location</span><span class="mock-val">Wantage</span></div>
          <div class="mock-row"><span class="mock-label">Start date</span><span class="mock-val">Flexible</span></div>
          <div class="mock-row"><span class="mock-label">Status</span><span class="mock-val" style="color:var(--amber)">New enquiry</span></div>
        </div>
      </div>
    </div>
    <!-- 2. Laser Measure -->
    <div class="feature-block flip">'''


def main():
    path = os.path.join(BASE, TARGET)
    if not os.path.exists(path):
        print("[ERROR] file not found: " + path)
        return

    with io.open(path, "r", encoding="utf-8") as f:
        content = f.read()

    count = content.count(ANCHOR)
    if count == 0:
        print("[MISS] Could not find the anchor block.")
        return
    elif count > 1:
        print("[WARN] Found " + str(count) + " matches - expected 1. Aborting.")
        return

    content = content.replace(ANCHOR, NEW_BLOCK, 1)

    with io.open(path, "w", encoding="utf-8") as f:
        f.write(content)

    print("[OK] Added AI Receptionist feature block")
    print("")
    print("Review with: git --no-pager diff features/index.html")
    print("Then: git add features/index.html")
    print("Then: git commit -m 'Add AI Receptionist feature to website'")
    print("Then: git push")


if __name__ == "__main__":
    main()
