export const authAdditionalUserFields = {
  role: {
    type: "string",
    input: false,
    defaultValue: "user",
  },
  locale: {
    type: "string",
    required: false,
    defaultValue: "en",
  },
  phone: {
    type: "string",
    required: false,
  },
  street: {
    type: "string",
    required: false,
  },
  number: {
    type: "string",
    required: false,
  },
  zipcode: {
    type: "string",
    required: false,
  },
  town: {
    type: "string",
    required: false,
  },
  countryId: {
    type: "string",
    required: false,
  },
} as const;

export type AuthAdditionalUserFields = typeof authAdditionalUserFields;
