"""Check a service-account key and its model against the real API.

Isolates "is this key and model right" from "is the transport working", so a
failure points at one thing. Usage, from the server directory:

    python scripts/check_provider.py                    # every configured slot
    python scripts/check_provider.py gemini-free
    python scripts/check_provider.py gemini-paid --list-gemini
"""
import argparse
import asyncio
import logging
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.llm.base import LLMConfigError, LLMProviderError  # noqa: E402
from app.llm.registry import get_provider  # noqa: E402

logger = logging.getLogger("check_provider")


def _slots() -> Dict[str, Tuple[str, str, str, Optional[str]]]:
    """slot -> (env var, provider, model, key)"""
    return {
        "gemini-free": (
            "GEMINI_FREE_API_KEY",
            "gemini",
            settings.gemini_free_model,
            settings.gemini_free_api_key,
        ),
        "gemini-paid": (
            "GEMINI_PAID_API_KEY",
            "gemini",
            settings.gemini_paid_model,
            settings.gemini_paid_api_key,
        ),
        "openai": ("OPENAI_API_KEY", "openai", settings.openai_model, settings.openai_api_key),
        "anthropic": (
            "ANTHROPIC_API_KEY",
            "anthropic",
            settings.anthropic_model,
            settings.anthropic_api_key,
        ),
    }


def list_gemini_models(api_key: Optional[str]) -> int:
    from google import genai

    if not api_key:
        logger.error("that Gemini slot has no key set")
        return 1
    client = genai.Client(api_key=api_key)
    logger.info("models this key can call:")
    for model in client.models.list():
        actions = getattr(model, "supported_actions", None) or []
        if not actions or "generateContent" in actions:
            logger.info("  %s", model.name)
    return 0


async def check_slot(slot: str, prompt: str) -> bool:
    env_var, provider_name, model, api_key = _slots()[slot]
    if not api_key:
        logger.info("%-12s SKIP  %s is not set", slot, env_var)
        return True

    provider = get_provider(provider_name)
    try:
        result = await provider.generate(
            prompt=prompt, history=[], model=model, max_tokens=2048, api_key=api_key
        )
    except LLMConfigError as exc:
        logger.error("%-12s FAIL  %s", slot, exc)
        return False
    except LLMProviderError as exc:
        # The provider's own message is the useful part: a 429 means the key works
        # but its tier does not cover this model, which looks nothing like a wrong key.
        logger.error("%-12s FAIL  %s", slot, str(exc)[:170])
        return False

    answer = result.content.strip().replace("\n", " ")[:60]
    logger.info("%-12s OK    %s -> %r", slot, model, answer)
    return True


async def run(slots: List[str], prompt: str) -> int:
    ok = True
    for slot in slots:
        ok = await check_slot(slot, prompt) and ok
    return 0 if ok else 1


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("slot", nargs="?", choices=sorted(_slots()), help="default: every slot")
    parser.add_argument("--prompt", default="Reply with one short sentence confirming you are working.")
    parser.add_argument("--list-gemini", action="store_true", help="list models this Gemini key can call")
    args = parser.parse_args()

    if args.list_gemini:
        slot = args.slot or "gemini-free"
        raise SystemExit(list_gemini_models(_slots()[slot][3]))

    slots = [args.slot] if args.slot else list(_slots())
    raise SystemExit(asyncio.run(run(slots, args.prompt)))


if __name__ == "__main__":
    main()
