# 目的: 外部依存なし（標準ライブラリのみ）で OSV API と照合し、真の脆弱性を抽出する。
# 更新履歴: Rev 001 (2026-10-23) 新規作成
#           Rev 002 (2026-10-23) uv 管理環境のメタデータ照合に対応
#           Rev 003 (2026-10-23) packaging 依存を排除し標準ライブラリ自作パーサへ刷新

import json
import re
import sys
import urllib.error
import urllib.request
from importlib.metadata import distributions


def parse_version_safe(ver_text: str):
    try:
        clean_text = ver_text.split("+")[0].strip()
        nums = re.findall(r"\d+", clean_text)
        if not nums:
            raise ValueError(f"No numeric components in version: {ver_text}")
        parsed_tuple = tuple(int(n) for n in nums)
    except (ValueError, TypeError, AttributeError):
        parsed_tuple = None
    return parsed_tuple


def collect_target_packages():
    result = []
    for dist in distributions():
        name = dist.metadata.get("Name")
        if not name:
            continue
        raw_ver = dist.version.split("+")[0]
        result.append(
            {
                "package": {"name": name, "ecosystem": "PyPI"},
                "version": raw_ver,
            }
        )
    return result


def is_version_affected(cur_ver, rng):
    introduced, fixed = None, None
    for ev in rng.get("events", []):
        if "introduced" in ev and ev["introduced"] != "0":
            introduced = parse_version_safe(ev["introduced"])
        if "fixed" in ev:
            fixed = parse_version_safe(ev["fixed"])

    hit = False
    if introduced and fixed and introduced <= cur_ver < fixed:
        hit = True
    elif fixed and not introduced and cur_ver < fixed:
        hit = True
    elif introduced and not fixed and cur_ver >= introduced:
        hit = True
    return hit


def query_osv_batch(pkgs):
    req = urllib.request.Request(
        "https://api.osv.dev/v1/querybatch",
        data=json.dumps({"queries": pkgs}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read().decode("utf-8"))
    return data


def evaluate_vulnerabilities(pkgs, osv_results):
    vulnerable_list = []
    for idx, item in enumerate(osv_results.get("results", [])):
        pname = pkgs[idx]["package"]["name"]
        cur_ver_str = pkgs[idx]["version"]
        cur_ver = parse_version_safe(cur_ver_str)
        if not cur_ver:
            continue

        matched_ids = []
        for vuln in item.get("vulns", []):
            for aff in vuln.get("affected", []):
                aff_name = aff.get("package", {}).get("name", "")
                if aff_name.lower() != pname.lower():
                    continue
                for rng in aff.get("ranges", []):
                    if is_version_affected(cur_ver, rng):
                        matched_ids.append(vuln.get("id"))

        if matched_ids:
            unique_ids = sorted(list(set(matched_ids)))
            vulnerable_list.append((pname, cur_ver_str, unique_ids))
    return vulnerable_list


def main():
    pkgs = collect_target_packages()
    if not pkgs:
        sys.stdout.write("✓ Environment empty or clean.\n")
        return

    try:
        osv_data = query_osv_batch(pkgs)
    except urllib.error.URLError as e:
        sys.stderr.write(f"Network error: {e}\n")
        sys.exit(1)

    vulns = evaluate_vulnerabilities(pkgs, osv_data)
    if not vulns:
        sys.stdout.write("✓ No active vulnerabilities found.\n")
        return

    for name, ver, ids in vulns:
        sys.stdout.write(f"! VULNERABLE: {name} ({ver}) -> {', '.join(ids)}\n")


if __name__ == "__main__":
    main()
