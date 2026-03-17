export interface JWTPayload {
  username?: string
  source?: string
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
