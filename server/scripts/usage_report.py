"""What answers cost, from the relay's own traffic.

    python scripts/usage_report.py

Answers the question the add-on's price depends on: if someone uses their whole
monthly allowance, what does that cost? Guessing it is unreliable — every message
re-sends the conversation so far, and models that think before answering bill
that reasoning as output without showing it.
"""
import json
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.pricing import cost_usd, rate_for  # noqa: E402


def load(path: Path) -> list:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            try:
                rows.append(json.loads(line))
            except ValueError:
                continue
    return rows


def main() -> None:
    path = Path(settings.usage_log_path)
    if not path.is_absolute():
        path = Path(__file__).resolve().parent.parent / path

    rows = load(path)
    if not rows:
        print(f"No answers recorded yet ({path}).")
        print("Ask Ferry a few questions, then run this again.")
        raise SystemExit(0)

    # Cost is worked out here rather than read from the row. A rate that arrives
    # later — or is corrected — should apply to everything already recorded, and
    # answers logged before their model had a rate would otherwise stay
    # permanently uncosted and quietly drop out of every total.
    for r in rows:
        r["cost_usd"] = cost_usd(r["model"], r.get("input_tokens"), r.get("output_tokens"))

    by_model = defaultdict(list)
    for r in rows:
        by_model[r["model"]].append(r)

    print(f"{len(rows)} answers recorded\n")
    print(f"  {'model':28} {'n':>4} {'in':>8} {'out':>8} {'$/answer':>10} {'$/300':>9}")
    print(f"  {'-' * 28} {'-' * 4} {'-' * 8} {'-' * 8} {'-' * 10} {'-' * 9}")

    unpriced = []
    for model, entries in sorted(by_model.items(), key=lambda kv: -len(kv[1])):
        ins = [e["input_tokens"] for e in entries if e["input_tokens"] is not None]
        outs = [e["output_tokens"] for e in entries if e["output_tokens"] is not None]
        costs = [e["cost_usd"] for e in entries if e["cost_usd"] is not None]
        if rate_for(model) is None:
            unpriced.append(model)
        avg_in = f"{statistics.mean(ins):,.0f}" if ins else "—"
        avg_out = f"{statistics.mean(outs):,.0f}" if outs else "—"
        per = statistics.mean(costs) if costs else None
        print(
            f"  {model:28} {len(entries):>4} {avg_in:>8} {avg_out:>8}"
            f" {('$%.5f' % per) if per else '—':>10} {('$%.2f' % (per * 300)) if per else '—':>9}"
        )

    paid = [e["cost_usd"] for e in rows if e.get("paid") and e["cost_usd"] is not None]
    if paid:
        per = statistics.mean(paid)
        pool = settings.purchase_answer_allowance
        print(f"\nPaid answers: {len(paid)}, averaging ${per:.5f} each.")
        print(f"  The {pool} answers one purchase buys cost ${per * pool:.2f} to serve.")
        print(f"  Worst single answer seen: ${max(paid):.5f}.")
        # The pool is finite, so this is the whole exposure per sale, not per year.
        print(f"  Against {settings.unlock_price_display} a sale, that is what a customer "
              f"costs however long they stay.")

    free = [e["cost_usd"] for e in rows if not e.get("paid") and e["cost_usd"] is not None]
    if free:
        per_free = statistics.mean(free)
        monthly = per_free * settings.free_answer_allowance
        # Nobody pays for these, so this is the bill for having users at all.
        print(f"\nFree answers: {len(free)}, averaging ${per_free:.5f} each.")
        print(f"  A device's {settings.free_answer_allowance} free answers a month: ${monthly:.2f}.")
        print(f"  A hundred such devices: ${monthly * 100:.2f} a month.")

    brief = [e["output_tokens"] for e in rows if e.get("brief") and e["output_tokens"]]
    full = [e["output_tokens"] for e in rows if not e.get("brief") and e["output_tokens"]]
    if brief and full:
        saved = 1 - statistics.mean(brief) / statistics.mean(full)
        print(f"\nAsking for less: short answers average {statistics.mean(brief):,.0f} output "
              f"tokens against {statistics.mean(full):,.0f} — {saved:.0%} smaller.")

    _reports()

    if unpriced:
        print("\nNo rate configured, so these are excluded from every cost above:")
        for m in unpriced:
            print(f"  {m}")
        print("Add them to server/model_prices.json as {\"model\": {\"input\": 0.0, \"output\": 0.0}}")


def _reports() -> None:
    """What people flagged, and about which model.

    Play requires these reports to inform what the app does next, which they
    cannot do sitting unread in a file on a volume. Printed here rather than in
    a script of their own because this is the report someone already runs.
    """
    path = Path(settings.report_log_path)
    if not path.is_absolute():
        path = Path(__file__).resolve().parent.parent / path
    if not path.exists():
        return

    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            rows.append(json.loads(line))
        except ValueError:
            continue
    if not rows:
        return

    print(f"\nReported answers: {len(rows)}.")
    by_reason = Counter(r.get("reason", "other") for r in rows)
    for reason, count in by_reason.most_common():
        print(f"  {reason}: {count}")

    # Which provider wrote the offending answers is the actionable part: Ferry
    # carries three and changes none of them, so the only lever is which to carry.
    by_model = Counter(r.get("model") or "unknown" for r in rows)
    if len(by_model) > 1 or "unknown" not in by_model:
        print("  by model:")
        for model, count in by_model.most_common():
            print(f"    {model}: {count}")

    print(f"  Full text: {path}")


if __name__ == "__main__":
    main()
