/**
 * Discount configuration
 */

export const discountConfig = {
  /**
   * Discount code format configuration
   * - pattern: The format pattern for generating discount codes
   *   - {part1}: First segment of the code
   *   - {part2}: Second segment of the code
   */
  codeFormat: {
    pattern: "{staticPrefix}{separator}{part1}{separator}{part2}",
    separator: "-",
    staticPrefix: "DSCT",
    part1Length: 3,
    part2Length: 4,
    characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  },

  /**
   * Maximum number of attempts to generate a unique code
   */
  maxGenerationAttempts: 10,

  /**
   * Default discount settings
   */
  defaults: {
    type: "percentage" as const,
    maxUses: null as number | null,
  },
} as const;
