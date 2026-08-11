#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DODO_PAYMENTS_ENVIRONMENT:-}" ]]; then
  printf 'Missing required GitHub variable: DODO_PAYMENTS_ENVIRONMENT\n' >&2
  exit 1
fi

if [[ "${DODO_PAYMENTS_ENVIRONMENT}" != "test_mode" && "${DODO_PAYMENTS_ENVIRONMENT}" != "live_mode" ]]; then
  printf 'DODO_PAYMENTS_ENVIRONMENT must be exactly test_mode or live_mode\n' >&2
  exit 1
fi

if [[ "${DODO_PAYMENTS_ENVIRONMENT}" == "live_mode" && "${DODO_LIVE_MODE_APPROVED:-}" != "approved-live-payments" ]]; then
  printf 'Live Dodo payments require DODO_LIVE_MODE_APPROVED=approved-live-payments\n' >&2
  exit 1
fi
