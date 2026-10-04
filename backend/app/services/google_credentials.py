"""Build Google API credentials from the tokens stored for a session."""

import google.oauth2.credentials


def build_credentials(tokens: dict) -> google.oauth2.credentials.Credentials:
    return google.oauth2.credentials.Credentials(
        token=tokens["token"],
        refresh_token=tokens.get("refresh_token"),
        token_uri=tokens["token_uri"],
        client_id=tokens["client_id"],
        client_secret=tokens["client_secret"],
        scopes=tokens.get("scopes"),
    )
