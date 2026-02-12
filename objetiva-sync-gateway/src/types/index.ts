export interface JWTPayload {
  username: string
  authenticated: boolean
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload
    user: JWTPayload
  }
}

export interface DecodedToken {
  header: { alg: string; typ?: string }
  payload: { iat?: number; exp?: number; username?: string; authenticated?: boolean }
}

declare module 'fastify' {
  interface FastifyInstance {
    jwt: {
      sign: (payload: JWTPayload) => string
      verify: (token: string) => JWTPayload
      decode: (token: string, options?: { complete?: boolean }) => DecodedToken | null
    }
  }
  interface FastifyRequest {
    jwtVerify: () => Promise<void>
    user: JWTPayload
  }
}
