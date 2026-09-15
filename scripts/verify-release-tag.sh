#!/usr/bin/env bash
set -euo pipefail

release_tag="${1:?release tag is required}"
built_commit="${2:?built commit is required}"

if [[ ! "$release_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
   [[ ! "$built_commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid release tag or built commit" >&2
  exit 1
fi

if ! refs="$(git ls-remote --tags origin "refs/tags/$release_tag" "refs/tags/$release_tag^{}" 2>/dev/null)"; then
  echo "Could not read remote release tags" >&2
  exit 1
fi

if [[ -z "$refs" ]]; then
  # The release action may create a new tag only at target_commitish.
  exit 0
fi

peeled_commit="$(awk -v ref="refs/tags/$release_tag^{}" '$2 == ref { print $1; exit }' <<< "$refs")"
direct_target="$(awk -v ref="refs/tags/$release_tag" '$2 == ref { print $1; exit }' <<< "$refs")"
tag_commit="${peeled_commit:-$direct_target}"

if [[ "$tag_commit" != "$built_commit" ]]; then
  echo "Release tag $release_tag points to a different commit than the packaged build" >&2
  exit 1
fi
