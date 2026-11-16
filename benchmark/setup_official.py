"""Fetch only the public organizer files needed by synthetic benchmark tests.

Metrica Sports, MIT License; the upstream LICENSE is saved alongside the files.
No match data or ground truth is requested.
"""
import argparse
import hashlib
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

REVISION = "f8f2629ff1e0985f81d7e59d8413678514ee1530"
BASE_URL = f"https://raw.githubusercontent.com/metrica-sports/more-than-a-hack-2027/{REVISION}/"
FILES = {
    "evaluation/possession_metrics.py": "341bad48904b489d6e875397b27687f5d6a4d22a397f3dc8af3a00d48f16874d",
    "starter/baseline.py": "84d8a414fb1bdf8c7e1fbe4a8789fe6f9cc0c2cccec4685201285b75dbc0cfe6",
    "games.py": "3b2122794e9e0476e2b3a871d14880e5fa47c4feaeacf99caef054c2309076ce",
    "LICENSE": "b1f93728571a232a0e158abdd869891f2efd51894134fb20678292c2468ff3ec",
}
DESTINATION = Path(__file__).resolve().parents[1] / "source" / "more-than-a-hack-2027"


def digest(content):
    return hashlib.sha256(content).hexdigest()


def setup(verify_only=False):
    for relative, expected in FILES.items():
        target = DESTINATION / relative
        if target.is_file():
            actual = digest(target.read_bytes())
            if actual != expected:
                raise RuntimeError(f"{target}: SHA-256 mismatch; expected {expected}, got {actual}")
            print(f"verified {relative}")
            continue
        if verify_only:
            raise RuntimeError(f"{target}: missing; run python benchmark/setup_official.py")
        url = BASE_URL + relative
        try:
            with urlopen(url, timeout=30) as response:
                content = response.read()
        except (OSError, URLError) as exc:
            raise RuntimeError(f"could not fetch public organizer file {url}: {exc}") from exc
        actual = digest(content)
        if actual != expected:
            raise RuntimeError(f"{url}: SHA-256 mismatch; expected {expected}, got {actual}")
        target.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation: never replace an existing file, even after a race.
        with target.open("xb") as handle:
            handle.write(content)
        print(f"fetched and verified {relative}")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true",
                        help="check installed files without network access or writes")
    args = parser.parse_args(argv)
    try:
        setup(args.verify_only)
    except (OSError, RuntimeError) as exc:
        parser.exit(1, f"official setup failed: {exc}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

