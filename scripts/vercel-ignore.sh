#!/usr/bin/env bash
# Vercel "Ignored Build Step" for both projects: exit 0 skips the build, exit 1 builds.
# Usage (from the project's root directory): bash vercel-ignore.sh <pathspec>...
#
# Compares with the commit of the project's last deployment. Vercel clones only the last 10
# commits; when that commit is older (the photo project often deploys rarely), the history is
# fetched first, and if that is not possible, the oldest commit in the clone is the base. An
# error here would fail the deployment instead.
base="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"
has() { git cat-file -e "$1^{commit}" 2>/dev/null; }
if ! has "$base"; then
  git fetch --quiet --deepen=1000 origin 2>/dev/null || git fetch --quiet --unshallow origin 2>/dev/null
fi
if ! has "$base"; then
  # Still missing (Vercel's clone cannot fetch): compare with the oldest commit the clone has.
  # A change before that would have deployed back then, which moves the base forward.
  oldest="$(git rev-list HEAD | tail -n 1)"
  if [ -z "$oldest" ] || [ "$oldest" = "$(git rev-parse HEAD)" ]; then
    echo "Last deployed commit $base is not in the clone: building."
    exit 1
  fi
  echo "Last deployed commit $base is not in the clone; comparing with $oldest instead."
  base="$oldest"
fi
if git diff --quiet "$base" HEAD -- "$@"; then
  echo "No changes since $base: skipping the build."
  exit 0
fi
echo "Changes since $base: building."
exit 1
