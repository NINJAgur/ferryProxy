from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from app.config import settings

router = APIRouter()

# Play requires a URL describing how someone gets their data deleted, not just an
# address to write to. Ferry has no accounts, so most of it is self-service and the
# page says so rather than inventing a process nobody needs.
_PAGE = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ferry — Deleting your data</title>
<style>
  :root {{ color-scheme: dark; }}
  body {{ margin:0; padding:2.5rem 1.25rem 4rem; background:#161826; color:#e9e9ed;
         font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }}
  main {{ max-width:44rem; margin:0 auto; }}
  h1 {{ font-size:1.9rem; margin:0 0 .35rem; letter-spacing:-.02em; }}
  h2 {{ font-size:1.1rem; margin:2.2rem 0 .5rem; color:#b5abfc; }}
  p, li {{ color:#c9c9d6; }}
  .sub {{ color:#8b8ba7; margin:0 0 2rem; }}
  ul, ol {{ padding-left:1.2rem; }}
  a {{ color:#b5abfc; }}
</style></head><body><main>

<h1>Deleting your data</h1>
<p class="sub">Ferry — last updated {updated}</p>

<p>Ferry has no accounts, so there is no profile to close. Almost everything Ferry
holds is on your own device, and you can remove it yourself at any time.</p>

<h2>On your device — immediate</h2>
<p>Open <strong>Settings</strong> in the app:</p>
<ul>
  <li><strong>Delete all chats</strong> removes every conversation. They are stored
      in a file on your device and are never uploaded, so this is the only copy.</li>
  <li><strong>Clear bandwidth history</strong> removes the figures on the Data screen.</li>
</ul>
<p>Uninstalling Ferry removes all of it, including the random identifier described
below.</p>

<h2>On our server</h2>
<p>The relay does not store your conversations. It holds only:</p>
<ul>
  <li><strong>Pieces of an answer</strong>, for about {ttl} minutes, so a piece lost on
      a weak connection can be fetched again. These expire on their own.</li>
  <li><strong>A random identifier</strong> created by the app, with a count of how many
      free answers it has used this month. It is not linked to you, your account or
      your device's hardware.</li>
  <li><strong>A purchase identifier</strong>, if you bought the add-on, with how many
      paid answers you have used this month.</li>
</ul>

<h2>Asking us to delete those</h2>
<ol>
  <li>Contact us at <a href="{contact}">{contact}</a> and ask for deletion.</li>
  <li>We will remove the identifier and its usage counts.</li>
</ol>
<p>Deleting a purchase record does not refund it, and since the store holds the
purchase rather than we do, <em>Restore purchases</em> may bring it back. Deleting
the free-tier counter does not grant extra free answers.</p>

<h2>What we never had</h2>
<p>No name, email address, password, phone number, location, contacts or payment
details. Purchases are handled by Google Play; we never see a card.</p>

<p>See also the <a href="/privacy">privacy policy</a>.</p>

</main></body></html>
"""


@router.get("/delete-data", response_class=HTMLResponse)
async def delete_data() -> HTMLResponse:
    return HTMLResponse(
        _PAGE.format(
            updated=settings.privacy_updated,
            ttl=max(1, settings.cache_ttl_seconds // 60),
            contact=settings.privacy_contact,
        )
    )
