

def test_every_model_in_the_catalogue_has_a_rate():
    """A model without one records tokens and no cost, so it vanishes from the
    report — which is how the free tier's bill stayed invisible."""
    from app.catalogue import catalogue
    from app.pricing import rate_for

    unpriced = [m.id for m in catalogue(subscribed=True) if rate_for(m.id) is None]

    assert unpriced == []


def test_notes_in_the_rate_file_are_not_read_as_models():
    from app.pricing import _load_overrides

    assert not any(k.startswith("_") for k in _load_overrides())
