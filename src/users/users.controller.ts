import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import type { Requester } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// Cada ruta pasa al servicio quién hace la petición (req.user, que llena
// JwtStrategy): el servicio decide si puede actuar sobre el usuario pedido.
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Request() req: { user: Requester }) {
    return this.usersService.findAll(req.user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: Requester },
  ) {
    return this.usersService.findOneFor(req.user, id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Request() req: { user: Requester },
  ) {
    return this.usersService.update(req.user, id, dto);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: Requester },
  ) {
    return this.usersService.remove(req.user, id);
  }
}
