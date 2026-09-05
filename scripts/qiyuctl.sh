#!/usr/bin/env bash
# A small, safe control surface for a Qiyu NAS deployment.
#
# It deliberately uses `stop` instead of `down`: user files, Jellyfin state,
# collector jobs and the Radar database are never removed by this script.
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
default_project_root="$(cd "$script_dir/.." && pwd)"

project_root="${QIYU_PROJECT_ROOT:-$default_project_root}"
core_compose_file="${QIYU_COMPOSE_FILE:-$project_root/compose.yaml}"
core_env_file="${QIYU_ENV_FILE:-$project_root/.env}"
prepare_script="${QIYU_PREPARE_SCRIPT:-$project_root/scripts/prepare-storage.sh}"

radar_project_root="${RADAR_PROJECT_ROOT:-/srv/menglin-radar}"
radar_compose_file="${RADAR_COMPOSE_FILE:-$radar_project_root/compose.yaml}"
radar_env_file="${RADAR_ENV_FILE:-$radar_project_root/.env}"

usage() {
  cat <<'EOF'
Usage:
  qiyuctl.sh start   [core|radar|all] [--build]
  qiyuctl.sh restart [core|radar|all] [--build]
  qiyuctl.sh stop    [core|radar|all]
  qiyuctl.sh status  [core|radar|all]
  qiyuctl.sh logs    [core|radar|all] [--follow]

Defaults:
  The target is `all` (Qiyu core services plus Radar). `start` only starts
  existing images. Add `--build` after source changes to rebuild Qiyu first.

Safety:
  `stop` only stops containers. It never runs `docker compose down`, never
  removes volumes, and never deletes NAS files, Jellyfin metadata, collector
  jobs or the Radar database.
EOF
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

require_compose() {
  command -v docker >/dev/null 2>&1 || die "Docker is not installed or not on PATH."
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required."
}

require_file() {
  local label="$1"
  local file="$2"
  [[ -f "$file" ]] || die "$label is missing: $file"
}

core_compose() {
  require_file "Qiyu Compose file" "$core_compose_file"
  require_file "Qiyu environment file" "$core_env_file"
  docker compose --env-file "$core_env_file" -f "$core_compose_file" "$@"
}

radar_compose() {
  require_file "Radar Compose file" "$radar_compose_file"
  require_file "Radar environment file" "$radar_env_file"
  docker compose --env-file "$radar_env_file" -f "$radar_compose_file" "$@"
}

prepare_storage() {
  [[ -x "$prepare_script" ]] || return 0
  NAS_ROOT="$(awk -F= '$1 == "NAS_ROOT" { sub(/^[^=]*=/, ""); print; exit }' "$core_env_file")" \
  CONFIG_ROOT="$(awk -F= '$1 == "CONFIG_ROOT" { sub(/^[^=]*=/, ""); print; exit }' "$core_env_file")" \
  "$prepare_script"
}

run_target() {
  local target="$1"
  local core_action="$2"
  local radar_action="$3"
  shift 3

  case "$target" in
    core)
      core_compose "$core_action" "$@"
      ;;
    radar)
      radar_compose "$radar_action" "$@"
      ;;
    all)
      if [[ "$core_action" == "stop" ]]; then
        radar_compose "$radar_action" "$@"
        core_compose "$core_action" "$@"
      else
        core_compose "$core_action" "$@"
        radar_compose "$radar_action" "$@"
      fi
      ;;
    *)
      die "Unknown target: $target (use core, radar, or all)."
      ;;
  esac
}

command_name="${1:-}"
[[ -n "$command_name" ]] || { usage; exit 2; }
if [[ "$command_name" == "--help" || "$command_name" == "-h" ]]; then
  usage
  exit 0
fi
shift

target="all"
build=false
follow=false
while (($#)); do
  case "$1" in
    core|radar|all) target="$1" ;;
    --build) build=true ;;
    --follow|-f) follow=true ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

require_compose

case "$command_name" in
  start)
    if [[ "$target" == "core" || "$target" == "all" ]]; then
      prepare_storage
    fi
    if "$build"; then
      run_target "$target" up up -d --build
    else
      run_target "$target" up up -d
    fi
    ;;
  restart)
    if "$build"; then
      run_target "$target" up up -d --build --force-recreate
    else
      run_target "$target" restart restart
    fi
    ;;
  stop)
    run_target "$target" stop stop
    ;;
  status)
    run_target "$target" ps ps
    ;;
  logs)
    if "$follow"; then
      run_target "$target" logs logs --follow --tail=150
    else
      run_target "$target" logs logs --tail=150
    fi
    ;;
  *)
    usage
    exit 2
    ;;
esac
