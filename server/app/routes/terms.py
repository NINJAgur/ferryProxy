from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from app.config import settings

router = APIRouter()

_STYLE = """
  :root { color-scheme: dark; }
  body { margin:0; padding:2.5rem 1.25rem 4rem; background:#161826; color:#e9e9ed;
         font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  main { max-width:44rem; margin:0 auto; }
  h1 { font-size:1.9rem; margin:0 0 .35rem; letter-spacing:-.02em; }
  h2 { font-size:1.1rem; margin:2.2rem 0 .5rem; color:#b5abfc; }
  p, li { color:#c9c9d6; }
  .sub { color:#8b8ba7; margin:0 0 2rem; }
  ul { padding-left:1.2rem; }
  a { color:#b5abfc; }
  .box { border:1px solid #2a2c46; border-radius:12px; padding:1.1rem 1.25rem; margin:1.5rem 0; }
"""

_TERMS = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ferry — Terms</title><style>{style}</style></head><body><main>

<h1>Terms</h1>
<p class="sub">Ferry — last updated {updated}</p>

<p>Ferry is an app that carries questions to AI models over connections too weak for
most apps, and carries the answers back. These terms cover using it and buying the
add-on.</p>

<h2>What you are buying</h2>
<p>One payment, once. It is <strong>not</strong> a subscription: nothing recurs,
nothing renews, and there is nothing to cancel. What it buys is a quantity rather
than a period — a fixed number of answers on the paid models, Claude, GPT and
Gemini Pro, with your choice of which version answers you.</p>
<p>The purchase includes that fixed number of answers on the paid models — the number
shown on the <a href="/pricing">pricing page</a> at the time you buy. They do not
expire and they do not renew: one payment buys that many answers, for as long as you
take to use them. When they run out, the free model continues to work.</p>
<p>The pool is finite because each answer costs us money from the provider, and the
payment happens once. Buying more is a matter of buying again.</p>
<p>Gemini Flash is free, with a monthly allowance that renews, and needs no purchase.</p>

<h2>What Ferry cannot promise</h2>
<ul>
  <li><strong>Answers come from third parties</strong> — Anthropic, OpenAI and Google.
      Ferry does not write them, cannot guarantee they are correct, and they should
      not be relied on for medical, legal, financial or other consequential decisions.</li>
  <li><strong>A weak connection is still a weak connection.</strong> Ferry is built to
      get more through a bad line than a normal app would. It cannot work with no
      connection at all, and on a very poor one some answers will not arrive.</li>
  <li><strong>Providers change.</strong> Which models are offered may change if a
      provider withdraws one, changes its terms, or becomes unavailable.</li>
</ul>

<h2>Fair use</h2>
<p>Do not use Ferry to break the law, to generate material that harms others, or to
attempt to circumvent the allowances or the app's payment. Automated or bulk use is
not what the allowances are sized for.</p>

<h2>Refunds</h2>
<p>Purchases made through Google Play are covered by Google's refund policy.
Purchases made through the web checkout are handled by Paddle, the merchant of
record, and are covered by their refund terms. Contact us and we will help either
way.</p>

<h2>Your data</h2>
<p>Covered separately in the <a href="/privacy">privacy policy</a> and the page on
<a href="/delete-data">deleting your data</a>. In short: no accounts, no ads, no
tracking, and your conversations stay on your device.</p>

<h2>Changes</h2>
<p>These terms may change as the app does. The date at the top says when they last
did.</p>

<h2>Contact</h2>
<p><a href="{contact}">{contact}</a></p>

</main></body></html>
"""

_DONE = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ferry — Purchase complete</title><style>{style}</style></head><body><main>

<h1>Thank you.</h1>
<p class="sub">Your receipt is on its way by email.</p>

<div class="box">
  <p><strong>Return to Ferry and press "Restore purchases"</strong> — on the opening
  screen, or in Settings under "Your plan".</p>
</div>

<p>If nothing unlocks, give it a few seconds and press it again.</p>

<p><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></p>

</main></body></html>
"""


@router.get("/terms", response_class=HTMLResponse)
async def terms() -> HTMLResponse:
    return HTMLResponse(
        _TERMS.format(style=_STYLE, updated=settings.privacy_updated, contact=settings.privacy_contact)
    )


@router.get("/purchase-complete", response_class=HTMLResponse)
async def purchase_complete() -> HTMLResponse:
    """Where the web checkout lands someone.

    The purchase happens in a browser, so the app has no result to wait for — it
    has to ask afterwards. This page exists to tell someone that, rather than
    leaving them on a generic receipt wondering why nothing unlocked.
    """
    return HTMLResponse(_DONE.format(style=_STYLE))
