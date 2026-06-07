import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
} from '@nestjs/common';
import { KavitaService } from './kavita.service';

// ---------------------------------------------------------------- DTOs

class KavitaLoginDto {
  username!: string;
  password!: string;
}

class KavitaRefreshDto {
  jwt!: string;
  refreshToken!: string;
}

// ---------------------------------------------------------------- Controller

@Controller('kavita')
export class KavitaController {
  constructor(private readonly kavita: KavitaService) {}

  // ---------- GET /api/kavita/status
  @Get('status')
  getStatus() {
    return {
      data: this.kavita.enabled,
      code: this.kavita.enabled ? 200 : 404,
    };
  }

  // ---------- POST /api/kavita/login
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: KavitaLoginDto) {
    if (!this.kavita.enabled) {
      return {
        data: 'No Kavita Configuration, doesn\'t support login',
        code: 434,
      };
    }

    try {
      const result = await this.kavita.login(body.username, body.password);
      return { data: result, code: 200 };
    } catch {
      return { data: 'Login Failed', code: 500 };
    }
  }

  // ---------- POST /api/kavita/refreshtoken
  @Post('refreshtoken')
  @HttpCode(200)
  async refreshToken(@Body() body: KavitaRefreshDto) {
    if (!this.kavita.enabled) {
      return {
        data: 'No Kavita Configuration, doesn\'t support refresh token',
        code: 434,
      };
    }

    try {
      const result = await this.kavita.refreshToken(body.jwt, body.refreshToken);
      return { data: result, code: 200 };
    } catch {
      return { data: 'Refresh Token Failed', code: 500 };
    }
  }
}
