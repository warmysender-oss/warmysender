#!/bin/sh
set -eu
if [ "${1:-}" = "doctor" ]; then
  exec node apps/server/dist/index.js doctor
fi
exec "$@"
