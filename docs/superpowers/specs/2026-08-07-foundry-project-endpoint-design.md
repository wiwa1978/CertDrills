# Foundry Project Endpoint Derivation Design

## Goal

Configure blueprint parsing with the Microsoft Foundry project endpoint and derive the Responses API URL automatically.

## Configuration

The API accepts:

```env
AZURE_AI_FOUNDRY_PROJECT_ENDPOINT=https://<resource>.services.ai.azure.com/api/projects/<project>
AZURE_AI_FOUNDRY_API_KEY=<key>
AZURE_AI_FOUNDRY_MODEL=<deployment-name>
```

`AZURE_AI_FOUNDRY_RESPONSES_URL` is removed. Supporting both values would preserve unnecessary duplicate configuration, and the administrator explicitly selected project-endpoint-only behavior.

## URL Derivation

An exported Foundry URL helper:

1. parses the project endpoint as a URL;
2. removes trailing slashes from its pathname;
3. appends `/openai/v1/responses`;
4. preserves the project endpoint origin;
5. rejects project endpoints containing query strings or fragments.

Example:

```text
https://example.services.ai.azure.com/api/projects/certdrills/
```

becomes:

```text
https://example.services.ai.azure.com/api/projects/certdrills/openai/v1/responses
```

The helper lives with the Foundry parser integration rather than in bootstrap or the environment schema. Bootstrap remains responsible only for selecting and constructing the configured provider.

## Bootstrap Behavior

The Foundry parser is configured only when the project endpoint, API key, and model deployment name are all present. Bootstrap derives the Responses API URL and passes it to the existing `createFoundryBlueprintParser`.

When any required value is missing, the existing not-configured parser behavior remains unchanged.

## Migration

Local and deployed environments must replace:

```env
AZURE_AI_FOUNDRY_RESPONSES_URL=...
```

with:

```env
AZURE_AI_FOUNDRY_PROJECT_ENDPOINT=...
```

The API example environment and tests are updated accordingly.

## Testing

Tests cover:

- a project endpoint without a trailing slash;
- one or more trailing slashes;
- preservation of the complete `/api/projects/<project>` path;
- rejection of query strings and fragments;
- bootstrap using the derived Responses URL;
- bootstrap remaining unconfigured when the project endpoint, API key, or model is missing;
- absence of the removed `AZURE_AI_FOUNDRY_RESPONSES_URL` configuration.
