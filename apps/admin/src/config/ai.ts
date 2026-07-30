/**
 * Application configuration
 *
 * This file contains app-wide configuration settings that can be
 * easily modified without changing the core logic.
 */

import { fa } from "zod/v4/locales";

export const aiConfig = {
  /**
   * AI Chat Configuration
   */
  ai: {
    /**
     * Enable AI chat feature.
     * When false, the chat menu item will be hidden.
     */
    enabled: true,

    /**
     * AI provider to use for chat functionality.
     * Currently supported: "openai"
     */
    provider: "openai" as const,

    /**
     * OpenAI model to use for chat completions.
     * Options: "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"
     * @default "gpt-4o-mini"
     */
    model: "gpt-4o-mini",

    /**
     * Maximum tokens for AI responses.
     * @default 1000
     */
    maxTokens: 1000,

    /**
     * Temperature for AI responses (0-2).
     * Lower = more deterministic, Higher = more creative.
     * @default 0.7
     */
    temperature: 0.7,

    /**
     * System prompt for the AI assistant.
     */
    systemPrompt: "You are a helpful assistant. Be concise and helpful in your responses.",
  },
} as const;

export type AiConfig = typeof aiConfig;

