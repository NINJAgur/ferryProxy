import logging
from typing import Optional, Tuple

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from app.config import settings

logger = logging.getLogger(__name__)


class AuthNotConfigured(Exception):
    """The relay has no Google client id, so it cannot verify who anyone is."""


class InvalidCredential(Exception):
    """The token did not verify — expired, wrong audience, or not from Google."""


def verify_google_id_token(token: str) -> Tuple[str, str]:
    """Return (subject, email) for a verified Google ID token.

    Verification is real, not a stub: it checks Google's signature and that the
    token was issued for this app. It needs GOOGLE_CLIENT_ID to know which
    audience to accept, which is why an unconfigured relay refuses rather than
    trusting whatever it is handed.
    """
    if not settings.google_client_id:
        raise AuthNotConfigured("GOOGLE_CLIENT_ID is not set on the relay")

    try:
        claims = google_id_token.verify_oauth2_token(
            token, google_requests.Request(), settings.google_client_id
        )
    except ValueError as exc:
        raise InvalidCredential(str(exc)) from exc

    subject: Optional[str] = claims.get("sub")
    email: str = claims.get("email", "")
    if not subject:
        raise InvalidCredential("token carried no subject")
    return subject, email
