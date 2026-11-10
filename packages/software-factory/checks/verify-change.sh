#!/usr/bin/env bash
set -euo pipefail

patch="$1"
if [[ ! -s "$patch" || ! -f .forge/verify-change || -L .forge/verify-change || -L .forge ]]; then
  echo "A nonempty patch and a reviewed .forge/verify-change file are required." >&2
  exit 2
fi

git apply --check -- "$patch"
paths="$(mktemp)"
trap 'rm -f -- "$paths"' EXIT
git apply --numstat -z -- "$patch" > "$paths"
count=0
while IFS= read -r -d '' record; do
  path="${record#*$'\t'}"
  path="${path#*$'\t'}"
  case "${path,,}" in
    ''|.forge|.forge/*|checks|checks/*|.github|.github/*|apm.yml|apm.lock.yaml|apm-policy.yml|request.md|plan.md|specification.md|implementation.md|review.md|changes.diff|*.contract.md)
      printf 'Patch touches a protected path or uses a rename/copy: %s\n' "$path" >&2
      exit 1
      ;;
  esac
  count=$((count + 1))
done < "$paths"
if [[ "$count" -eq 0 ]]; then
  echo "The patch must change at least one project file." >&2
  exit 1
fi

bash -e .forge/verify-change "$patch"
