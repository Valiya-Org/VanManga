"""
DogeManga HTTP session.

Wraps requests.Session with CloudFlare credential injection.
All calls here run inside a ThreadPoolExecutor, so synchronous requests is correct.
"""
import logging
import requests
import json

logger = logging.getLogger(__name__)

_FLARESOLVERR_TIMEOUT = 60_000   # ms, passed to FlareSolverr
_FLARESOLVERR_RETRIES = 5


def make_session(cf_dict: dict) -> requests.Session:
    """Return a requests.Session pre-configured with CF credentials if active."""
    session = requests.Session()
    if cf_dict.get("cf_activate"):
        session.headers.update({"User-Agent": cf_dict["cf_userAgent"]})
        session.cookies.set("cf_clearance", cf_dict["cf_clearance_value"])
    return session


def refresh_cf_bypass(cf_dict: dict, flaresolverr_url: str, target_url: str) -> dict:
    """
    Call FlareSolverr to solve the CloudFlare challenge and update cf_dict
    with fresh credentials.  cf_dict is mutated in place and returned.
    """
    import datetime

    cf_dict["cf_activate"] = True
    headers = {"Content-Type": "application/json"}
    payload = {
        "cmd": "request.get",
        "url": target_url,
        "maxTimeout": _FLARESOLVERR_TIMEOUT,
        "returnOnlyCookies": True,
    }

    response = requests.post(flaresolverr_url, headers=headers, json=payload)
    retries = 0
    while json.loads(response.content)["status"] != "ok" and retries < _FLARESOLVERR_RETRIES:
        response = requests.post(flaresolverr_url, headers=headers, json=payload)
        retries += 1

    content = json.loads(response.content)
    if content["status"] != "ok":
        logger.error("FlareSolverr failed after %d retries", retries)
        return cf_dict

    solution = content["solution"]
    for item in solution["cookies"]:
        if item["name"] == "cf_clearance":
            cf_dict["cf_clearance_value"] = item["value"]

    cf_dict["cf_userAgent"] = solution["userAgent"]
    cf_dict["updateTime"] = datetime.datetime.now()
    logger.info("CF clearance refreshed via FlareSolverr")
    return cf_dict
