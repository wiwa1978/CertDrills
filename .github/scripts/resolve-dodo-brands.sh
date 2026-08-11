#!/usr/bin/env bash
set -euo pipefail

brand_names=(DODO_CREDITS_BRAND_ID DODO_SUBSCRIPTIONS_BRAND_ID DODO_TRANSACTIONS_BRAND_ID)

active_brand_is_known=false
for name in "${brand_names[@]}"; do
  if [[ "${ACTIVE_DODO_BRAND_ENV}" == "${name}" ]]; then
    active_brand_is_known=true
    break
  fi
done
if [[ "${active_brand_is_known}" != "true" ]]; then
  printf 'Unknown active Dodo brand setting: %s\n' "${ACTIVE_DODO_BRAND_ENV}" >&2
  exit 1
fi

normalized_name="$(printf '%s' "${APP_NAME}" | tr '[:upper:]_' '[:lower:]-')"
api_app_name="${normalized_name}-api"
api_app_name="${api_app_name:0:32}"
existing_env='[]'
if az containerapp show \
  --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
  --name "${api_app_name}" \
  --output none 2>/dev/null; then
  existing_env="$(az containerapp show \
    --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
    --name "${api_app_name}" \
    --query 'properties.template.containers[0].env' \
    --output json)"
fi

declare -A effective_brands=()
for name in "${brand_names[@]}"; do
  value="${!name}"
  if [[ -z "${value}" ]]; then
    value="$(jq -r --arg name "${name}" '[.[]? | select(.name == $name) | (.value // empty)] | last // empty' <<< "${existing_env}")"
  fi
  effective_brands["${name}"]="${value}"
done

for name in "${brand_names[@]}"; do
  value="${effective_brands[${name}]}"
  if [[ -n "${value}" && ! "${value}" =~ ^(brnd|bus)_[A-Za-z0-9]+$ ]]; then
    printf 'Malformed Dodo brand setting: %s\n' "${name}" >&2
    exit 1
  fi
done

if [[ -z "${effective_brands[${ACTIVE_DODO_BRAND_ENV}]}" ]]; then
  printf 'Missing required production Dodo brand setting: %s\n' "${ACTIVE_DODO_BRAND_ENV}" >&2
  exit 1
fi

for name in "${brand_names[@]}"; do
  value="${effective_brands[${name}]}"
  if [[ -n "${value}" ]]; then
    printf '::add-mask::%s\n' "${value}"
  fi
  printf 'EFFECTIVE_%s=%s\n' "${name}" "${value}" >> "${GITHUB_ENV}"
done
