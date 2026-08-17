import argparse

from backend.app.config import settings
from backend.app.persistence import Database


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage RevoMail SQLite migrations.")
    parser.add_argument("direction", choices=("up", "down"), nargs="?", default="up")
    args = parser.parse_args()

    database = Database(settings.database_url)
    version = database.migrate() if args.direction == "up" else database.rollback_last()
    print(f"SQLite schema is at version {version} in {database.path}.")


if __name__ == "__main__":
    main()
