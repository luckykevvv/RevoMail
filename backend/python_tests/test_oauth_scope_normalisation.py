"""
Regression test for the real-world Google sign-in failure where the callback always redirected
to AUTHORIZATION_FAILED. Root cause: Google's token response scope string almost never matches
what we requested word-for-word (it normalises "userinfo.email"/"userinfo.profile" to "email"/
"profile", and include_granted_scopes=true re-lists scopes granted in an earlier authorization,
such as a leftover gmail.readonly from before gmail.modify was requested). oauthlib treats that
mismatch as fatal unless OAUTHLIB_RELAX_TOKEN_SCOPE is set, which backend/app/routers/auth.py
now sets at import time.

These tests exercise the real oauthlib scope-comparison code (no fakes), so they fail if that
line is ever removed, not just if our own code changes.
"""

import os

import pytest
from oauthlib.oauth2.rfc6749.parameters import validate_token_parameters
from oauthlib.oauth2.rfc6749.tokens import OAuth2Token

import backend.app.routers.auth  # noqa: F401  (import triggers the os.environ.setdefault fix)

REQUESTED_SCOPE = (
    "openid https://www.googleapis.com/auth/userinfo.email "
    "https://www.googleapis.com/auth/userinfo.profile "
    "https://www.googleapis.com/auth/gmail.modify "
    "https://www.googleapis.com/auth/gmail.send"
)

# What Google actually sends back in the callback query string in this bug report: normalised
# short names for email/profile, plus a leftover gmail.readonly from an earlier authorization.
GOOGLE_RETURNED_SCOPE = (
    "email profile https://www.googleapis.com/auth/gmail.readonly "
    "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send "
    "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.profile "
    "https://www.googleapis.com/auth/userinfo.email openid"
)


def _token_with_scope_change():
    return OAuth2Token(
        {"access_token": "a", "token_type": "Bearer", "scope": GOOGLE_RETURNED_SCOPE},
        old_scope=REQUESTED_SCOPE,
    )


def test_our_app_has_relaxed_the_scope_check_on_import():
    assert os.environ.get("OAUTHLIB_RELAX_TOKEN_SCOPE") == "1"


def test_googles_normalised_scope_response_would_fail_without_the_relax_setting(monkeypatch):
    """Proves this is the real bug: without the fix, Google's own (correct) response is rejected."""
    monkeypatch.delenv("OAUTHLIB_RELAX_TOKEN_SCOPE", raising=False)
    with pytest.raises(Warning):
        validate_token_parameters(_token_with_scope_change())


def test_googles_normalised_scope_response_is_accepted_with_the_relax_setting(monkeypatch):
    monkeypatch.setenv("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")
    validate_token_parameters(_token_with_scope_change())  # must not raise
