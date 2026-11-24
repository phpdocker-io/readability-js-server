#!/usr/bin/env bash
set -euo pipefail

# Copy Artifact Hub metadata into a gh-pages checkout, then commit and push
# every pending change (chart package, index.yaml, metadata) as one commit.

gh_pages_dir="${1:?usage: publish-gh-pages.sh <gh-pages-checkout> [commit-message]}"
commit_message="${2:-Publish Artifact Hub repository metadata}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

install -m 0644 "${repo_root}/artifacthub-repo.yml" "${gh_pages_dir}/artifacthub-repo.yml"
install -m 0644 /dev/null "${gh_pages_dir}/.nojekyll"

cd "${gh_pages_dir}"
git config user.name "${GITHUB_ACTOR}"
git config user.email "${GITHUB_ACTOR}@users.noreply.github.com"
git add -A
if git diff --cached --quiet; then
  echo "gh-pages is already up to date"
  exit 0
fi
git commit -m "${commit_message}"
git push origin gh-pages
