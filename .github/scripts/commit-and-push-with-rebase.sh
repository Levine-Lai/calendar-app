#!/usr/bin/env bash
set -euo pipefail

target_file="${1:?usage: commit-and-push-with-rebase.sh <file> <message>}"
commit_message="${2:?usage: commit-and-push-with-rebase.sh <file> <message>}"
branch="${GITHUB_REF_NAME:-main}"

if git diff --quiet -- "$target_file"; then
  echo "No changes to commit for $target_file."
  exit 0
fi

git config user.name "sports-calendar-news-bot"
git config user.email "sports-calendar-news-bot@users.noreply.github.com"
git add "$target_file"
git commit -m "$commit_message"

for attempt in 1 2 3 4; do
  echo "Push attempt $attempt: rebasing onto origin/$branch first."
  git fetch origin "$branch"
  if ! git rebase "origin/$branch"; then
    git rebase --abort || true
    echo "The generated news file conflicts with a newer remote update." >&2
    exit 1
  fi

  if git push origin "HEAD:$branch"; then
    exit 0
  fi

  sleep $((attempt * 2))
done

echo "Unable to push after four synchronized attempts." >&2
exit 1
