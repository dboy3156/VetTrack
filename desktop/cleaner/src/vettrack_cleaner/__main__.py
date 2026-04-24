"""python -m vettrack_cleaner"""

from __future__ import annotations

import sys

from vettrack_cleaner.app import run


def main() -> None:
    sys.exit(run())


if __name__ == "__main__":
    main()
