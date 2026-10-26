import { ValidationPipe } from '@nestjs/common';

/** The app-wide ValidationPipe (registered in main.ts). Shared so HTTP-level
 *  tests validate bodies exactly like production.
 *
 *  Note `whitelist: true`: DTO properties WITHOUT a class-validator
 *  decorator are stripped from the body before it reaches the handler. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: false,
  });
}
