#!/usr/bin/env bash
set -euo pipefail

# TODO(infra): switch from raw kubectl to helm chart once chart is reviewed
# TODO: add rollback step on failed health-check (5xx > 1% for 60s)

kubectl apply -f manifests/

# FIXME: prod migrations are still run manually — hook to CI gated by approval
