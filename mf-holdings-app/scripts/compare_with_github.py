#!/usr/bin/env python3
"""
Compare local mf-holdings-app files with the version on GitHub.

Default remote:
  https://github.com/h-viseria/opensource/tree/main/mf-holdings-app

Usage:
  python scripts/compare_with_github.py
  python scripts/compare_with_github.py --local-dir .
  python scripts/compare_with_github.py --json report.json
  python scripts/compare_with_github.py --show-unchanged
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, Iterable, List, Set, Tuple

DEFAULT_OWNER = "h-viseria"
DEFAULT_REPO = "opensource"
DEFAULT_BRANCH = "main"
DEFAULT_SUBPATH = "mf-holdings-app"
DEFAULT_SKIP_DIRS = {
    "node_modules",
    ".git",
    "__pycache__",
    ".cursor",
    ".vscode",
    "tests/output",
}
USER_AGENT = "mf-holdings-github-compare/1.0"


class GitHubClient:
    def __init__(self, owner: str, repo: str, branch: str, subpath: str) -> None:
        self.owner = owner
        self.repo = repo
        self.branch = branch
        self.subpath = subpath.strip("/")
        self._last_request_at = 0.0

    def _get_json(self, url: str) -> dict:
        # Gentle rate limiting for unauthenticated GitHub API use.
        elapsed = time.time() - self._last_request_at
        if elapsed < 0.2:
            time.sleep(0.2 - elapsed)

        request = urllib.request.Request(
            url,
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": USER_AGENT,
            },
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            self._last_request_at = time.time()
            return json.loads(response.read().decode("utf-8"))

    def _get_bytes(self, url: str) -> bytes:
        elapsed = time.time() - self._last_request_at
        if elapsed < 0.2:
            time.sleep(0.2 - elapsed)

        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=60) as response:
            self._last_request_at = time.time()
            return response.read()

    def list_remote_files(self, skip_dirs: Set[str]) -> List[str]:
        return [
            rel_path
            for rel_path in self._list_all_remote_files()
            if not should_skip(rel_path, skip_dirs)
        ]

    def _list_all_remote_files(self) -> List[str]:
        branch_url = (
            f"https://api.github.com/repos/{self.owner}/{self.repo}/branches/{self.branch}"
        )
        branch_info = self._get_json(branch_url)
        commit_sha = branch_info["commit"]["sha"]

        tree_url = (
            f"https://api.github.com/repos/{self.owner}/{self.repo}/git/trees/{commit_sha}"
            "?recursive=1"
        )
        tree_info = self._get_json(tree_url)

        prefix = f"{self.subpath}/"
        files: List[str] = []
        for item in tree_info.get("tree", []):
            if item.get("type") != "blob":
                continue
            path = item.get("path", "")
            if not path.startswith(prefix):
                continue
            rel_path = path[len(prefix) :]
            if rel_path:
                files.append(rel_path.replace("\\", "/"))
        return sorted(files)

    def fetch_remote_file(self, rel_path: str) -> bytes:
        rel_path = rel_path.replace("\\", "/")
        raw_url = (
            f"https://raw.githubusercontent.com/{self.owner}/{self.repo}/"
            f"{self.branch}/{self.subpath}/{rel_path}"
        )
        return self._get_bytes(raw_url)


def should_skip(rel_path: str, skip_dirs: Set[str]) -> bool:
    normalized = rel_path.replace("\\", "/")
    parts = Path(rel_path).parts

    if any(part in skip_dirs for part in parts):
        return True

    for skip in skip_dirs:
        if "/" in skip and (normalized == skip or normalized.startswith(f"{skip}/")):
            return True

    return False


def collect_local_files(local_root: Path, skip_dirs: Set[str]) -> Dict[str, Path]:
    files: Dict[str, Path] = {}
    if not local_root.exists():
        raise FileNotFoundError(f"Local directory not found: {local_root}")

    for path in local_root.rglob("*"):
        if not path.is_file():
            continue
        rel_path = path.relative_to(local_root).as_posix()
        if should_skip(rel_path, skip_dirs):
            continue
        files[rel_path] = path
    return dict(sorted(files.items()))


def normalize_text_bytes(content: bytes) -> bytes:
    text = content.decode("utf-8", errors="replace")
    return "\n".join(text.splitlines()).encode("utf-8")


def content_hash(content: bytes, text_mode: bool = True) -> str:
    payload = normalize_text_bytes(content) if text_mode else content
    return hashlib.sha256(payload).hexdigest()


def read_local_hash(path: Path) -> str:
    return content_hash(path.read_bytes())


def compare_trees(
    local_files: Dict[str, Path],
    remote_files: Iterable[str],
    client: GitHubClient,
) -> Tuple[List[str], List[str], List[str], List[str]]:
    local_set = set(local_files)
    remote_set = set(remote_files)

    only_local = sorted(local_set - remote_set)
    only_remote = sorted(remote_set - local_set)
    common = sorted(local_set & remote_set)

    modified: List[str] = []
    unchanged: List[str] = []

    for rel_path in common:
        local_hash = read_local_hash(local_files[rel_path])
        try:
            remote_bytes = client.fetch_remote_file(rel_path)
        except urllib.error.HTTPError as exc:
            modified.append(rel_path)
            print(f"Warning: could not fetch remote file {rel_path}: HTTP {exc.code}", file=sys.stderr)
            continue

        remote_hash = content_hash(remote_bytes)
        if local_hash == remote_hash:
            unchanged.append(rel_path)
        else:
            modified.append(rel_path)

    return only_local, only_remote, modified, unchanged


def print_report(
    only_local: List[str],
    only_remote: List[str],
    modified: List[str],
    unchanged: List[str],
    show_unchanged: bool,
) -> None:
    def section(title: str, items: List[str]) -> None:
        print(f"\n{title} ({len(items)})")
        print("-" * len(title))
        if items:
            for item in items:
                print(f"  {item}")
        else:
            print("  (none)")

    print("mf-holdings-app: local vs GitHub comparison")
    section("Modified (local differs from GitHub)", modified)
    section("Added locally (not on GitHub)", only_local)
    section("Only on GitHub (missing locally)", only_remote)
    if show_unchanged:
        section("Unchanged", unchanged)

    changed_count = len(modified) + len(only_local) + len(only_remote)
    print(f"\nSummary: {changed_count} changed path(s)")
    print(f"  modified: {len(modified)}")
    print(f"  added locally: {len(only_local)}")
    print(f"  only on github: {len(only_remote)}")
    print(f"  unchanged: {len(unchanged)}")


def main() -> int:
    script_dir = Path(__file__).resolve().parent
    default_local = script_dir.parent

    parser = argparse.ArgumentParser(
        description="Compare local mf-holdings-app with GitHub main branch."
    )
    parser.add_argument(
        "--local-dir",
        default=str(default_local),
        help=f"Local project root (default: {default_local})",
    )
    parser.add_argument("--owner", default=DEFAULT_OWNER)
    parser.add_argument("--repo", default=DEFAULT_REPO)
    parser.add_argument("--branch", default=DEFAULT_BRANCH)
    parser.add_argument("--subpath", default=DEFAULT_SUBPATH)
    parser.add_argument(
        "--skip-dir",
        action="append",
        default=[],
        help="Directory name to exclude (can be repeated)",
    )
    parser.add_argument(
        "--show-unchanged",
        action="store_true",
        help="Also print unchanged files",
    )
    parser.add_argument(
        "--json",
        metavar="PATH",
        help="Write machine-readable report to JSON file",
    )
    args = parser.parse_args()

    local_root = Path(args.local_dir).resolve()
    skip_dirs = set(DEFAULT_SKIP_DIRS)
    skip_dirs.update(args.skip_dir)

    client = GitHubClient(args.owner, args.repo, args.branch, args.subpath)

    print(
        f"Comparing local: {local_root}\n"
        f"Against GitHub: https://github.com/{args.owner}/{args.repo}/tree/{args.branch}/{args.subpath}",
        file=sys.stderr,
    )

    try:
        remote_files = client.list_remote_files(skip_dirs)
        local_files = collect_local_files(local_root, skip_dirs)
        only_local, only_remote, modified, unchanged = compare_trees(
            local_files, remote_files, client
        )
    except urllib.error.HTTPError as exc:
        print(f"GitHub request failed: HTTP {exc.code} {exc.reason}", file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(f"Network error: {exc.reason}", file=sys.stderr)
        return 1

    print_report(only_local, only_remote, modified, unchanged, args.show_unchanged)

    if args.json:
        report = {
            "local_dir": str(local_root),
            "remote": {
                "owner": args.owner,
                "repo": args.repo,
                "branch": args.branch,
                "subpath": args.subpath,
                "url": (
                    f"https://github.com/{args.owner}/{args.repo}/tree/"
                    f"{args.branch}/{args.subpath}"
                ),
            },
            "modified": modified,
            "added_locally": only_local,
            "only_on_github": only_remote,
            "unchanged": unchanged,
            "summary": {
                "modified": len(modified),
                "added_locally": len(only_local),
                "only_on_github": len(only_remote),
                "unchanged": len(unchanged),
                "changed_total": len(modified) + len(only_local) + len(only_remote),
            },
        }
        Path(args.json).write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"\nJSON report written to: {args.json}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
