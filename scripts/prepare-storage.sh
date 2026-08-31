#!/usr/bin/env bash
set -Eeuo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
nas_root="${NAS_ROOT:-$project_dir/data}"
config_root="${CONFIG_ROOT:-$project_dir/config}"

mkdir -p \
  "$nas_root/files" \
  "$nas_root/media/Inbox" \
  "$nas_root/media/Movies" \
  "$nas_root/media/Shows" \
  "$nas_root/sites/home" \
  "$config_root/caddy/data" \
  "$config_root/caddy/config" \
  "$config_root/jellyfin/config" \
  "$config_root/jellyfin/cache" \
  "$config_root/collector"

printf 'Prepared data directory: %s\n' "$nas_root"
printf 'Prepared config directory: %s\n' "$config_root"
