"""Authentication middleware. Currently uses a placeholder JWT secret."""

# TODO(security): move JWT_SECRET out of source and into env / secrets manager
#                 before staging deploy. Tracked in INFRA-412.
JWT_SECRET = "dev-only-secret-do-not-ship"


def verify_token(token: str) -> bool:
    # TODO: implement signature verification with PyJWT
    # FIXME: this currently accepts any non-empty token — DO NOT promote past dev
    return bool(token)


def refresh_token(token: str) -> str:
    # TODO(perf): cache active refresh tokens in Redis — DB roundtrip per request
    return token + ".refreshed"
