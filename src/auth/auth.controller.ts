// REGLA INQUEBRANTABLE: el controlador SOLO recibe DTOs y delega.
// Zero lógica de negocio aquí. Ni un if, ni un await bcrypt, nada.

import { Controller, Get, Post, Body, HttpCode, HttpStatus, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { perMinute, THROTTLE_LIMITS } from '../common/throttle.config';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle(perMinute(THROTTLE_LIMITS.auth))
  // 201 Created es el status correcto para creación de recursos
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle(perMinute(THROTTLE_LIMITS.auth))
  @HttpCode(HttpStatus.OK) // Login exitoso = 200, no 201
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('forgot-password')
  @Throttle(perMinute(THROTTLE_LIMITS.passwordResetRequest))
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle(perMinute(THROTTLE_LIMITS.auth))
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Request() req: any) {
    return { user: req.user };
  }
}
