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

declare module 'fastify' {
  interface FastifyInstance {
    jwt: {
      sign: (payload: JWTPayload) => string
      verify: (token: string) => JWTPayload
    }
  }
  interface FastifyRequest {
    jwtVerify: () => Promise<void>
    user: JWTPayload
  }
}
