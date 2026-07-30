export type paths = {
  "/health": {
    get: {
      responses: {
        200: {
          content: {
            "application/json": {
              success: boolean;
              data: {
                status: string;
              };
            };
          };
        };
      };
    };
  };
  "/me/credits/balance": {
    get: {
      responses: {
        200: {
          content: {
            "application/json": {
              success: boolean;
              data: {
                balance: string;
                totalPurchased: string;
                totalSpent: string;
              };
            };
          };
        };
      };
    };
  };
};
