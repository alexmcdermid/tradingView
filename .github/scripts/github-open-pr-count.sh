#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <owner/repo> [owner/repo ...]" >&2
  exit 1
fi

: "${GH_TOKEN:?GH_TOKEN is required for GitHub API access}"

total=0

for repository in "$@"; do
  count="$(gh api "repos/${repository}/pulls?state=open&base=main&per_page=100" \
    --jq "[.[] | select(.draft == false and .head.repo.full_name == \"${repository}\")] | length")"
  echo "${repository}: ${count} active same-repo PR(s)"
  total=$((total + count))
done

echo "Total active same-repo PRs: ${total}"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "count=${total}" >> "${GITHUB_OUTPUT}"
fi
