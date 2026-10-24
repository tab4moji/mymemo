# 目的: package.json から直接 OSV API へ問い合わせて脆弱性を検出する。
# 更新履歴: Rev 001 (2026-10-24) 新規作成

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path


def extract_packages(pkg_json_path: Path):
    try:
        data = json.loads(pkg_json_path.read_text(encoding="utf-8"))
        deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
        pkgs = []
        for name, spec in deps.items():
            nums = re.findall(r"\d+", str(spec))
            ver = ".".join(nums[:3]) if nums else "0.0.0"
            pkgs.append(
                {
                    "package": {"name": name, "ecosystem": "npm"},
                    "version": ver,
                }
            )
    except Exception as e:
        sys.stderr.write(f"Error parsing {pkg_json_path}: {e}\n")
        pkgs = []
    return pkgs


def query_osv(pkgs):
    req = urllib.request.Request(
        "https://api.osv.dev/v1/querybatch",
        data=json.dumps({"queries": pkgs}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read().decode("utf-8"))
    return data


def main():
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "package.json")
    if not target.exists():
        sys.stdout.write("Notice: package.json not found.\n")
        return

    pkgs = extract_packages(target)
    if not pkgs:
        sys.stdout.write("✓ No dependencies declared.\n")
        return

    try:
        osv_data = query_osv(pkgs)
    except urllib.error.URLError as e:
        sys.stderr.write(f"Network error: {e}\n")
        sys.exit(1)

    hits = []
    for idx, item in enumerate(osv_data.get("results", [])):
        if "vulns" in item:
            vuln_ids = sorted(list({v["id"] for v in item["vulns"]}))
            hits.append((pkgs[idx]["package"]["name"], vuln_ids))

    if not hits:
        sys.stdout.write("✓ No known vulnerabilities found.\n")
        return

    for name, ids in hits:
        sys.stdout.write(f"! VULNERABLE: {name} -> {', '.join(ids)}\n")


if __name__ == "__main__":
    main()
