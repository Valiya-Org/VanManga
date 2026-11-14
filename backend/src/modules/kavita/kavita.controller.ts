import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import type { AxiosError } from 'axios';
import { IsString } from 'class-validator';
import { ApiException } from '../../common/http/api-exception';
import { ok } from '../../common/http/envelope';
import { KavitaService } from './kavita.service';

// ---------------------------------------------------------------- DTOs
// Every field needs a class-validator decorator: the global ValidationPipe
// runs with `whitelist: true` and strips undecorated properties.

class KavitaLoginDto {
  @ApiProperty() @IsString() username!: string;
  @ApiProperty() @IsString() password!: string;
}

class KavitaRefreshDto {
  @ApiProperty() @IsString() jwt!: string;
  @ApiProperty() @IsString() refreshToken!: string;
}

// ---------------------------------------------------------------- Controller

/** docs/api-contract.md §3.5. */
@ApiTags('kavita')
@Controller('kavita')
export class KavitaController {
  constructor(private readonly kavita: KavitaService) {}

  /** Legacy shape kept on purpose: the current frontend calls this on
   *  every start and branches on the body code (200/404) with HTTP 200.
   *  New clients read `kavitaEnabled` from GET /api/config. Removed in P4. */
  @Get('status')
  @ApiOperation({
    summary: 'Deprecated: use GET /api/config (legacy body: code 200 or 404)',
    deprecated: true,
  })
  getStatus() {
    return {
      data: this.kavita.enabled,
      code: this.kavita.enabled ? 200 : 404,
    };
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log in to Kavita; returns apiKey, tokens and loginUrl' })
  async login(@Body() body: KavitaLoginDto) {
    this.assertEnabled();
    try {
      return ok(await this.kavita.login(body.username, body.password));
    } catch (err) {
      throw this.upstreamFailure(err, 'kavita-login-failed');
    }
  }

  @Post('refreshtoken')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refresh a Kavita JWT' })
  async refreshToken(@Body() body: KavitaRefreshDto) {
    this.assertEnabled();
    try {
      return ok(await this.kavita.refreshToken(body.jwt, body.refreshToken));
    } catch (err) {
      throw this.upstreamFailure(err, 'kavita-refresh-failed');
    }
  }

  private assertEnabled(): void {
    if (!this.kavita.enabled) {
      throw new ApiException(404, 'kavita-disabled', {
        message: 'Kavita is not configured on this server',
      });
    }
  }

  /** Kavita refusing the credentials is a 403 (401 is reserved for the
   *  admin token); anything else is an upstream failure. */
  private upstreamFailure(err: unknown, rejected: string): ApiException {
    const status = (err as AxiosError).response?.status;
    if (status === 400 || status === 401) {
      return new ApiException(403, rejected, { message: `Kavita answered ${status}` });
    }
    return new ApiException(502, 'kavita-unreachable', {
      message: (err as Error).message,
    });
  }
}
