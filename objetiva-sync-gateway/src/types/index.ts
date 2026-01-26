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
