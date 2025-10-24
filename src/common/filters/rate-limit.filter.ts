import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';

@Catch()
export class RateLimitFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    // If it's a 429, add Retry-After header
    if (exception instanceof HttpException && exception.getStatus && exception.getStatus() === 429) {
      try {
        const retry = parseInt(process.env.RETRY_AFTER_SECONDS || '300', 10); // default 300s as used in throttles
        response.setHeader('Retry-After', String(isNaN(retry) ? 300 : retry));
      } catch {}
    }

    // delegate to default response
    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    response.status(500).json({ statusCode: 500, message: 'Internal server error', error: 'InternalServerError' });
  }
}

