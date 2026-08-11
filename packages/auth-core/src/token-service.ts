import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

type TokenClaims = {
  sub: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
  type: "access";
};

type CreateTokenServiceOptions = {
  secret: string;
  issuer: string;
  audience: string;
  accessTokenTtlSeconds: number;
};

export function createTokenService(options: CreateTokenServiceOptions) {
  const secret = new TextEncoder().encode(options.secret);

  async function signAccessToken(userId: string) {
    const now = Math.floor(Date.now() / 1000);

    const payload: TokenClaims = {
      sub: userId,
      aud: options.audience,
      iss: options.issuer,
      iat: now,
      exp: now + options.accessTokenTtlSeconds,
      type: "access",
    };

    return await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(options.issuer)
      .setAudience(options.audience)
      .setSubject(userId)
      .setIssuedAt(now)
      .setExpirationTime(now + options.accessTokenTtlSeconds)
      .sign(secret);
  }

  async function verifyAccessToken(token: string) {
    const verified = await jwtVerify(token, secret, {
      issuer: options.issuer,
      audience: options.audience,
    });

    const claims = verified.payload as Partial<TokenClaims>;
    if (claims.type !== "access" || typeof claims.sub !== "string") {
      throw new Error("Invalid token claims");
    }

    return {
      userId: claims.sub,
      claims: claims as TokenClaims,
    };
  }

  function createRefreshToken() {
    return randomBytes(32).toString("hex");
  }

  function hashRefreshToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  return {
    signAccessToken,
    verifyAccessToken,
    createRefreshToken,
    hashRefreshToken,
  };
}
