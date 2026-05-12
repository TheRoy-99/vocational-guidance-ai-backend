// REGLA INQUEBRANTABLE: el controlador SOLO recibe DTOs y delega.
// Zero lógica de negocio aquí. Ni un if, ni un await bcrypt, nada.

import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  // 201 Created es el status correcto para creación de recursos
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK) // Login exitoso = 200, no 201
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}