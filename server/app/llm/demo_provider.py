import asyncio
from typing import List, Optional

from app.config import settings
from app.llm.base import LLMResult
from app.protocol.schemas import HistoryMessage

_CANNED = (
    "Not normal mid-lease unless your agreement allows it. Check for a rent-review clause — "
    "that's the one thing that decides it.\n\n"
    "**What to look for**\n\n"
    "1. A rent-review clause naming a date or an index. Without one, the rent is fixed for the term.\n"
    "2. The notice period. Fourteen days is unusually short; thirty to sixty is more typical.\n"
    "3. Any cap tied to an inflation measure — a 9% rise is well above the local average of about 4%.\n\n"
    "**What to send back**\n\n"
    "Ask them to point to the specific clause they're relying on. If they can't, the increase isn't "
    "enforceable until renewal. If they can, counter at the local average and mention the outstanding "
    "repairs as an offset.\n\n"
    "Keep it in writing, and keep it short — you want a paper trail, not an argument."
)


_DETAIL = [
    "**Notice periods**\n\nFourteen days is short by any standard. Most agreements settle on thirty, "
    "and sixty is common where the increase is substantial. A short notice period is worth challenging "
    "on its own, separately from the amount, because it limits your ability to seek advice or move.",
    "**What counts as a review clause**\n\nA review clause names either a date or a mechanism — an "
    "inflation index, a fixed percentage, or a market comparison. Vague wording about rents being "
    "'subject to change' is generally not enough to force an increase mid-term.",
    "**Drafting the reply**\n\nKeep it to three short paragraphs: acknowledge the letter, ask them to "
    "identify the clause they rely on, and state what you are willing to accept. Offering a number "
    "makes it a negotiation rather than a refusal, which tends to settle faster.",
    "**If they refuse to move**\n\nAsk for the increase to take effect at renewal instead. That is "
    "usually acceptable to a landlord who wants to keep a paying tenant, and it gives you months "
    "rather than a fortnight to decide whether to stay.",
    "**Keeping the record**\n\nPut everything in writing, even after a phone call — a short email "
    "confirming what was said is enough. If the dispute escalates, the sequence of letters is what "
    "decides it, and gaps in that sequence tend to be read against whoever left them.",
]


class DemoProvider:
    """Answers without any API key so the full transport can be exercised offline.

    Sleeps for `demo_delay_ms` to imitate a slow upstream, which is what makes the
    chunked "long wait" UI observable without a real provider.
    """

    async def generate(
        self,
        prompt: str,
        history: List[HistoryMessage],
        model: Optional[str],
        max_tokens: Optional[int],
        api_key: Optional[str] = None,
    ) -> LLMResult:
        await asyncio.sleep(settings.demo_delay_ms / 1000)
        # Length tracks the token budget, so "Answer short first" visibly changes the
        # answer — and a full-length answer is long enough to show what compressing
        # a real reply saves.
        budget = max_tokens if max_tokens is not None else settings.llm_max_tokens
        if budget <= 400:
            body = _CANNED.split("\n\n")[0]
        else:
            body = "\n\n".join([_CANNED] + _DETAIL[: max(0, budget // 400)])
        return LLMResult(
            content=f"{body}\n\n_(Demo answer for: {prompt.strip()[:80]})_",
            model="demo-1",
            stop_reason="end_turn",
        )
