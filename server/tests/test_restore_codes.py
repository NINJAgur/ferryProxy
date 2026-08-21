import pytest

from app import receipts
from app.receipts import CODE_PREFIX, Purchase
from app.restore_codes import RestoreCodes


@pytest.fixture
def codes(tmp_path, monkeypatch):
    store = RestoreCodes(path=tmp_path / "codes.json")
    monkeypatch.setattr(receipts, "restore_codes", store)
    return store


def test_a_customer_always_gets_the_same_code(codes):
    """Two codes for one purchase leaves the buyer unsure which one still works."""
    assert codes.for_customer("cust-1") == codes.for_customer("cust-1")


def test_codes_avoid_characters_that_get_copied_out_wrong(codes):
    code = codes.for_customer("cust-1")
    assert not set("O0I1") & set(code)
    assert code.count("-") == 2


def test_a_code_survives_the_process_that_minted_it(codes, tmp_path):
    code = codes.for_customer("cust-1")
    assert RestoreCodes(path=tmp_path / "codes.json").resolve(code) == "cust-1"


def test_an_unknown_code_resolves_to_nothing(codes):
    assert codes.resolve("ZZZZ-ZZZZ-ZZZZ") is None


async def test_a_code_stands_in_for_the_customer_it_was_minted_for(codes, monkeypatch):
    """The code carries identity across devices; the store still decides the rest."""
    codes.for_customer("dev:buyer")
    code = codes.for_customer("dev:buyer")
    monkeypatch.setattr(receipts.settings, "allow_dev_subscription", True)

    assert await receipts.verify_receipt(f"{CODE_PREFIX}{code}") == Purchase(id="dev:buyer", dev=True)


async def test_a_made_up_code_unlocks_nothing(codes):
    assert await receipts.verify_receipt(f"{CODE_PREFIX}NOPE-NOPE-NOPE") is None


def test_the_code_is_case_and_space_insensitive(codes):
    code = codes.for_customer("cust-1")
    assert codes.resolve(f"  {code.lower()}  ") == "cust-1"


def test_a_restored_device_buys_as_the_customer_it_restored(codes):
    """Buying as this install would open a second customer with its own pool,
    which the relay never adds to the first — money for answers nobody gets."""
    code = codes.for_customer("original-customer")

    assert receipts.customer_for(f"{CODE_PREFIX}{code}") == "original-customer"


def test_a_device_with_no_code_buys_as_itself(codes):
    assert receipts.customer_for("device-abc") == "device-abc"


def test_an_unknown_code_does_not_redirect_a_purchase(codes):
    """Falling back to the code itself keeps a bad code from quietly attaching a
    real purchase to someone else's customer."""
    assert receipts.customer_for(f"{CODE_PREFIX}NOPE") == f"{CODE_PREFIX}NOPE"
