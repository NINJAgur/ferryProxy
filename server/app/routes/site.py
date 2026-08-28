from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from app.config import settings

router = APIRouter()

# The public face of Ferry. It exists because a payment provider verifying a
# seller visits the domain and expects to find out what is being sold, for how
# much, and under what terms — and because a root URL that 404s reads as an
# abandoned service.
_STYLE = """
  :root { color-scheme: dark; }
  body { margin:0; padding:2.5rem 1.25rem 4rem; background:#161826; color:#e9e9ed;
         font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  main { max-width:44rem; margin:0 auto; }
  h1 { font-size:2.1rem; margin:0 0 .4rem; letter-spacing:-.025em; }
  h2 { font-size:1.1rem; margin:2.2rem 0 .5rem; color:#b5abfc; }
  p, li { color:#c9c9d6; }
  .sub { color:#8b8ba7; margin:0 0 2rem; font-size:1.05rem; }
  ul { padding-left:1.2rem; }
  a { color:#b5abfc; }
  nav { margin-top:3rem; padding-top:1.2rem; border-top:1px solid #2a2c46; font-size:14px; }
  nav a { margin-right:1.1rem; }
  .card { border:1px solid #2a2c46; border-radius:12px; padding:1.3rem 1.5rem; margin:1.5rem 0; }
  .price { font-size:2rem; color:#b5abfc; margin:0 0 .2rem; }
  .cta { margin:1.4rem 0 .6rem; }
  .button { display:inline-block; padding:.7rem 1.3rem; border-radius:10px;
            border:1px solid #6d5efc; color:#b5abfc; text-decoration:none; }
  .button:hover { background:rgba(109,94,252,0.12); }
  .tag { display:inline-block; font-size:12px; color:#8b8ba7; border:1px solid #2a2c46;
         border-radius:999px; padding:.15rem .6rem; margin-bottom:.6rem; }
"""

_NAV = """<nav>
  <a href="/">Ferry</a><a href="/pricing">Pricing</a><a href="/terms">Terms</a>
  <a href="/privacy">Privacy</a><a href="/refunds">Refunds</a><a href="/delete-data">Your data</a>
</nav>"""

_HOME = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ferry — a transport layer for weak connections</title><style>{style}</style></head><body><main>

<h1>Ferry</h1>
<p class="sub">A transport layer for connections that barely work.</p>

<p class="cta"><a class="button" href="{app}">Open Ferry in your browser</a></p>
<p class="sub">Free, with no account and no install. Gemini Flash answers straight
away; the paid models are one optional purchase, made inside the app.</p>

<p>A bar of signal on a train. Hotel wifi that drops every thirty seconds. The edge
of a village, an airport queue, a basement. Most apps assume a good connection and
spin forever when they do not get one. Ferry is built the other way round: it
assumes the line will drop, and gets what it can across anyway.</p>

<p>It is a client. Ferry runs no service of its own — it carries your question to
whichever assistant you choose, and carries the answer back in one piece.</p>

<h2>What it actually does</h2>
<ul>
  <li>Requests and answers are compressed — but only when compression actually
      helps, so nothing is ever made bigger by being wrapped up.</li>
  <li>Long answers are split into pieces and reassembled on your phone. A piece
      that goes missing is fetched again on its own, rather than restarting the
      whole answer.</li>
  <li>Offline, your question is queued and sent by itself when a signal appears.</li>
  <li>Ferry can ask for a short answer first — usually a fraction of the size of a
      full one, and by far the biggest saving on a thin line.</li>
</ul>

<h2>What it costs</h2>
<p>Free to install, with no account and no setup. One optional payment adds the
other providers Ferry can carry to. See <a href="/pricing">pricing</a>.</p>

<h2>How to buy it</h2>
<p><a href="{app}">Open Ferry</a>, then press <strong>Upgrade to Pro</strong> — on
the opening screen, or in Settings under "Your plan". That opens a hosted checkout;
once it is paid, press <strong>Restore purchases</strong> and the paid models
unlock. There is nothing to sign up for either side of it.</p>

<h2>Who answers</h2>
<p>Ferry does not write answers and operates no model of its own. Questions are
relayed to Anthropic, OpenAI or Google — whichever you pick — under their terms and
their content policies, which Ferry does not modify or bypass.</p>

<h2>Your conversations</h2>
<p>Ferry has no accounts. Chats are stored on your own device and are never
uploaded. See the <a href="/privacy">privacy policy</a>.</p>

{nav}
</main></body></html>
"""

_PRICING = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ferry — Pricing</title><style>{style}</style></head><body><main>

<h1>Pricing</h1>
<p class="sub">One optional payment. No subscription.</p>

<p>Ferry carries questions to assistants operated by other companies. Those
companies charge per answer; Ferry pays them and passes on access.</p>

<div class="card">
  <span class="tag">Free</span>
  <p class="price">$0</p>
  <p>Carries to Google's Gemini Flash immediately. No account, no card, no setup.
  Includes a monthly allowance that renews.</p>
</div>

<div class="card">
  <span class="tag">One-time purchase</span>
  <p class="price">{price}</p>
  <p><strong>Adds the other providers.</strong> Ferry can then carry to Anthropic's
  Claude, OpenAI's GPT and Google's Gemini Pro, and you choose which version
  answers you.</p>
  <p><a class="button" href="{app}">Open Ferry and upgrade</a></p>
  <ul>
    <li><strong>{pool} answers</strong> across Claude, GPT and Gemini Pro, to use in
        your own time. They do not expire.</li>
    <li>Paid once. It does not renew, and there is nothing to cancel.</li>
    <li>When the answers run out, Gemini Flash keeps working free. Buy again if you
        want more.</li>
    <li>Restores on a new device without an account.</li>
  </ul>
</div>

<p>Prices are shown in US dollars and converted at checkout. Sales tax or VAT is
added where required, and is shown before you pay.</p>

<p>Bought in the app, through a checkout hosted by our payment provider. See
<a href="/terms">terms</a> and the <a href="/refunds">refund policy</a>.</p>

{nav}
</main></body></html>
"""

_REFUNDS = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ferry — Refund Policy</title><style>{style}</style></head><body><main>

<h1>Refund policy</h1>
<p class="sub">Last updated {updated}</p>

<p>Ferry sells one thing: a one-time unlock for the paid models. If it does not do
what you expected, ask for a refund and you will get one.</p>

<h2>Within 14 days</h2>
<p>Refunds are given on request within 14 days of purchase, for any reason. You do
not need to justify it.</p>

<h2>After 14 days</h2>
<p>Refunds are considered on request. If the app stopped working, a model became
unavailable, or you were charged twice, you will be refunded regardless of when you
bought it.</p>

<h2>How to ask</h2>
<p>Contact us at <a href="{contact}">{contact}</a> with the email address you used
at checkout, or the receipt sent to you by our payment provider.</p>

<h2>How it is paid back</h2>
<p>Refunds return to the original payment method. Purchases made through Google Play are
handled under Google's refund policy, and can also be requested directly from
Google.</p>

<h2>What a refund does</h2>
<p>The paid models lock again. Gemini Flash continues to work free, and your
conversations stay on your device.</p>

{nav}
</main></body></html>
"""


@router.get("/", response_class=HTMLResponse)
async def home() -> HTMLResponse:
    return HTMLResponse(_HOME.format(style=_STYLE, nav=_NAV, app=settings.web_app_url))


@router.get("/pricing", response_class=HTMLResponse)
async def pricing() -> HTMLResponse:
    return HTMLResponse(_PRICING.format(style=_STYLE, nav=_NAV,
                                        app=settings.web_app_url,
                                        price=settings.unlock_price_display,
                                        pool=settings.purchase_answer_allowance))


@router.get("/refunds", response_class=HTMLResponse)
async def refunds() -> HTMLResponse:
    return HTMLResponse(
        _REFUNDS.format(
            style=_STYLE, nav=_NAV, updated=settings.privacy_updated, contact=settings.privacy_contact
        )
    )
