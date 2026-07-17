import { randomUUID, type KeyObject } from "node:crypto";
import {
  errors as joseErrors,
  jwtVerify,
  SignJWT,
  type JWK,
  type JWTHeaderParameters,
} from "jose";

type AgentSigningKey = KeyObject | CryptoKey | JWK | Uint8Array;

export type AgentJtiStore = {
  register(jti: string, ttlSeconds: number): Promise<void>;
  isActive(jti: string): Promise<boolean>;
  revoke(jti: string, ttlSeconds: number): Promise<void>;
};

export type AgentAssertionIdentity = {
  userId: string;
  jti: string;
  issuedAt: Date;
  expiresAt: Date;
  kid: string;
};

export class AgentAssertionError extends Error {
  constructor(
    public readonly code:
      | "ASSERTION_INVALID"
      | "ASSERTION_EXPIRED"
      | "ASSERTION_ISSUER_INVALID"
      | "ASSERTION_AUDIENCE_INVALID"
      | "ASSERTION_REVOKED",
    message: string,
  ) {
    super(message);
    this.name = "AgentAssertionError";
  }
}

type AgentTokenServiceOptions = {
  issuer: string;
  audience: string;
  ttlSeconds: number;
  activeKid: string;
  signingKeys: Array<{ kid: string; key: AgentSigningKey }>;
  verificationKeys: Array<{ kid: string; key: AgentSigningKey }>;
  stateStore: AgentJtiStore;
  now?: () => Date;
  createJti?: () => string;
};

function requiredText(value: string, name: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function assertionError(error: unknown) {
  if (error instanceof AgentAssertionError) return error;
  if (error instanceof joseErrors.JWTExpired) {
    return new AgentAssertionError("ASSERTION_EXPIRED", "用户身份令牌已过期");
  }
  if (error instanceof joseErrors.JWTClaimValidationFailed) {
    if (error.claim === "iss") {
      return new AgentAssertionError("ASSERTION_ISSUER_INVALID", "用户身份令牌签发方无效");
    }
    if (error.claim === "aud") {
      return new AgentAssertionError("ASSERTION_AUDIENCE_INVALID", "用户身份令牌受众无效");
    }
  }
  return new AgentAssertionError("ASSERTION_INVALID", "用户身份令牌无效");
}

export function createAgentTokenService(options: AgentTokenServiceOptions) {
  if (!Number.isInteger(options.ttlSeconds) || options.ttlSeconds < 300 || options.ttlSeconds > 900) {
    throw new Error("AGENT_AUTH_TOKEN_TTL_SECONDS must be between 300 and 900");
  }
  const issuer = requiredText(options.issuer, "AGENT_AUTH_ISSUER");
  const audience = requiredText(options.audience, "AGENT_AUTH_AUDIENCE");
  const activeKid = requiredText(options.activeKid, "AGENT_AUTH_ACTIVE_KID");
  const signingKeys = new Map(options.signingKeys.map((entry) => [entry.kid, entry.key]));
  const verificationKeys = new Map(options.verificationKeys.map((entry) => [entry.kid, entry.key]));
  const activeSigningKey = signingKeys.get(activeKid);
  if (!activeSigningKey) throw new Error(`No private signing key configured for active kid ${activeKid}`);
  if (!verificationKeys.has(activeKid)) {
    throw new Error(`No public verification key configured for active kid ${activeKid}`);
  }
  const now = options.now ?? (() => new Date());
  const createJti = options.createJti ?? randomUUID;

  return {
    async issue(userIdInput: string) {
      const userId = requiredText(userIdInput, "userId");
      const issuedAt = now();
      const issuedAtSeconds = Math.floor(issuedAt.getTime() / 1000);
      const expiresAtSeconds = issuedAtSeconds + options.ttlSeconds;
      const jti = createJti();
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: "EdDSA", kid: activeKid, typ: "JWT" })
        .setIssuer(issuer)
        .setSubject(userId)
        .setAudience(audience)
        .setIssuedAt(issuedAtSeconds)
        .setNotBefore(issuedAtSeconds)
        .setExpirationTime(expiresAtSeconds)
        .setJti(jti)
        .sign(activeSigningKey);
      await options.stateStore.register(jti, options.ttlSeconds);
      return { token, jti, expiresAt: new Date(expiresAtSeconds * 1000) };
    },

    async verify(tokenInput: string): Promise<AgentAssertionIdentity> {
      const token = requiredText(tokenInput, "assertion");
      try {
        const result = await jwtVerify(
          token,
          async (protectedHeader: JWTHeaderParameters) => {
            if (protectedHeader.alg !== "EdDSA" || !protectedHeader.kid) {
              throw new AgentAssertionError("ASSERTION_INVALID", "用户身份令牌算法或 kid 无效");
            }
            const key = verificationKeys.get(protectedHeader.kid);
            if (!key) throw new AgentAssertionError("ASSERTION_INVALID", "用户身份令牌 kid 未被信任");
            return key;
          },
          {
            algorithms: ["EdDSA"],
            issuer,
            audience,
            currentDate: now(),
            clockTolerance: 5,
          },
        );
        const { payload, protectedHeader } = result;
        if (
          !protectedHeader.kid
          || typeof payload.sub !== "string"
          || typeof payload.jti !== "string"
          || typeof payload.iat !== "number"
          || typeof payload.nbf !== "number"
          || typeof payload.exp !== "number"
        ) {
          throw new AgentAssertionError("ASSERTION_INVALID", "用户身份令牌缺少必要声明");
        }
        const signedLifetime = payload.exp - payload.iat;
        if (
          signedLifetime < 300
          || signedLifetime > 900
          || Math.abs(payload.nbf - payload.iat) > 5
        ) {
          throw new AgentAssertionError("ASSERTION_INVALID", "用户身份令牌有效期无效");
        }
        if (!(await options.stateStore.isActive(payload.jti))) {
          throw new AgentAssertionError("ASSERTION_REVOKED", "用户身份令牌已撤销或不存在");
        }
        return {
          userId: payload.sub,
          jti: payload.jti,
          issuedAt: new Date(payload.iat * 1000),
          expiresAt: new Date(payload.exp * 1000),
          kid: protectedHeader.kid,
        };
      } catch (error) {
        throw assertionError(error);
      }
    },
  };
}

export type AgentTokenService = ReturnType<typeof createAgentTokenService>;
