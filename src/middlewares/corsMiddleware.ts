import cors from '@fastify/cors';
import { FastifyInstance } from 'fastify';

export const corsMiddleware = (app: FastifyInstance) => {
  app.register(cors, {
    origin: (origin, callback) => {
      const allowedOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : ['http://192.168.4.2:5000'];
        // : ['http://localhost:3000', 'https://your-production-domain.com'];

      // Allow requests with no origin (mobile apps, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true); // Allow origin
      }

      // Deny origin
      return callback(new Error('❌ Not allowed by CORS'), false);
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    credentials: true,
  });
};