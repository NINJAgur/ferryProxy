"""Check a provider's credentials and model against the real API.

Isolates "is the key and model right" from "is the transport working", so a
failure points at one thing. Usage, from the server directory:

    python scripts/check_provider.py gemini
    python scripts/check_provider.py gemini --list-models
    python scripts/check_provider.py gemini --model gemini-2.5-flash
"""
import argparse
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.llm.base import LLMConfigError, LLMProviderError  # noqa: E402
from app.llm.registry import get_provider  # noqa: E402

logger = logging.getLogger("check_provider")

_ENV_VARS = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "gemini": "GEMINI_API_KEY",
}


def list_gemini_models() -> int:
    from google import genai

    if not settings.gemini_api_key:
        logger.error("GEMINI_API_KEY is not set in server/.env")
        return 1
    client = genai.Client(api_key=settings.gemini_api_key)
    logger.info("models that support generateContent:")
    for model in client.models.list():
        actions = getattr(model, "supported_actions", None) or []
        if not actions or "generateContent" in actions:
            logger.info("  %s", model.name)
    return 0


async def check(name: str, model: str, prompt: str) -> int:
    provider = get_provider(name)
    logger.info("calling %s (model=%s)...", name, model or "<default>")
    try:
        result = await provider.generate(prompt=prompt, history=[], model=model, max_tokens=256)
    except LLMConfigError:
        logger.error("%s is not configured — set %s in server/.env", name, _ENV_VARS.get(name, "its API key"))
        return 1
    except LLMProviderError as exc:
        logger.error("the provider rejected the call: %s", exc)
        return 1

    logger.info("OK — model reported as %s, stop_reason=%s", result.model, result.stop_reason)
    logger.info("answer (%d chars):\n%s", len(result.content), result.content.strip()[:600])
    return 0


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("provider", choices=["demo", "anthropic", "openai", "gemini"])
    parser.add_argument("--model", default=None, help="override the configured model")
    parser.add_argument("--prompt", default="Reply with one short sentence confirming you are working.")
    parser.add_argument("--list-models", action="store_true", help="gemini only: list usable models")
    args = parser.parse_args()

    if args.list_models:
        raise SystemExit(list_gemini_models())
    raise SystemExit(asyncio.run(check(args.provider, args.model, args.prompt)))


if __name__ == "__main__":
    main()
