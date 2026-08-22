import hashlib

# The bytes both ends already know, so they never have to be sent.
#
# Deflate encodes a repeat as a short backward reference, which is why it does
# nothing for a small message: there is no earlier copy of anything to point at,
# and the header costs more than the encoding saves. A preset dictionary hands
# the compressor a body of text to point *into* before the message even starts,
# so the first occurrence of `{"role":"user","content":"` costs a reference
# rather than twenty-five bytes.
#
# What belongs in here is whatever appears in almost every payload: the envelope
# keys, the model ids, and the commonest English words. Deflate matches against
# the END of the dictionary first, so the most valuable strings go last.
#
# Both ends must hold this byte for byte. client/src/transport/dictionary.ts is
# the other copy, and a test on each side pins this checksum so an edit to one
# cannot quietly diverge from the other.
SHARED_DICTIONARY = (
    b"the and that have with this from what your you for are was not but they "
    b"answer question please explain short version because there their which "
    b"gemini-3.6-flash gemini-flash-latest gemini-2.5-pro claude-opus-5 "
    b"claude-sonnet-5 claude-haiku-4-5-20251001 gpt-5 gpt-5-mini "
    b'"prompt":"","model":"","history":[],"maxTokens":2048,"brief":true,false'
    b'{"role":"user","content":""},{"role":"assistant","content":""}'
)

# Pinned so the two copies cannot drift apart unnoticed. A mismatch would not
# fail loudly — it would decompress to rubbish.
DICTIONARY_SHA256 = hashlib.sha256(SHARED_DICTIONARY).hexdigest()
