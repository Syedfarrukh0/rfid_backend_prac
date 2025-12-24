import { FastifyReply } from "fastify";

interface ErrorDetails {
  code?: number;
  message?: string;
  details?: any;
}

export const SendResponse = (
  reply: FastifyReply,
  status: number,
  success: boolean,
  message: string,
  data: any = null,
  error: ErrorDetails | null = null
) => {
  return reply.status(status).send({
    success,
    message,
    data,
    error: error
      ? {
          code: error.code || status,
          message: error.message || message,
          details: error.details || null,
        }
      : null,
  });
};
