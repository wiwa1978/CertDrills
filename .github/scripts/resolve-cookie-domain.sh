#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_ENV:?GITHUB_ENV is required}"
: "${GENERATED_API_URL:?GENERATED_API_URL is required}"

if [[ -n "${COOKIE_DOMAIN:-}" ]]; then
  effective_cookie_domain="${COOKIE_DOMAIN}"
else
  if [[ -n "${PUBLIC_WEB_URL:-}" || -n "${PUBLIC_API_URL:-}" || -n "${PUBLIC_ADMIN_URL:-}" ]]; then
    printf 'COOKIE_DOMAIN is required when any custom public URL is configured.\n' >&2
    exit 1
  fi

  api_host="${GENERATED_API_URL#*://}"
  api_host="${api_host%%/*}"
  effective_cookie_domain="${api_host#*.}"

  if [[ -z "${effective_cookie_domain}" || "${effective_cookie_domain}" == "${api_host}" ]]; then
    printf 'Could not derive the shared Container Apps environment domain from %s.\n' "${GENERATED_API_URL}" >&2
    exit 1
  fi
fi

if [[ "${effective_cookie_domain}" == *"://"* || "${effective_cookie_domain}" == */* || "${effective_cookie_domain}" != *.* ]]; then
  printf 'COOKIE_DOMAIN must be a domain name, received %s.\n' "${effective_cookie_domain}" >&2
  exit 1
fi

printf 'EFFECTIVE_COOKIE_DOMAIN=%s\n' "${effective_cookie_domain}" >> "${GITHUB_ENV}"
