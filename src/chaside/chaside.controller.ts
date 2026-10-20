import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ChasideService } from './services/chaside.service';
import { perMinute, THROTTLE_LIMITS } from '../common/throttle.config';
import { SubmitAssessmentDto } from './dto/submit-assessment.dto';
import { VocationalChatDto } from './dto/vocational-chat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('chaside')
export class ChasideController {
  constructor(private readonly chasideService: ChasideService) {}

  @Post('submit')
  @Throttle(perMinute(THROTTLE_LIMITS.chasideSubmit))
  @HttpCode(HttpStatus.OK)
  submit(@Request() req: any, @Body() dto: SubmitAssessmentDto) {
    return this.chasideService.submit(req.user.id, dto);
  }

  @Get('my-assessments')
  getMyAssessments(@Request() req: any) {
    return this.chasideService.getMyAssessments(req.user.id);
  }

  @Get('chat/history')
  getChatHistory(@Request() req: any) {
    return this.chasideService.getChatHistory(req.user.id);
  }

  @Get(':id/results')
  getResults(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ) {
    return this.chasideService.getResults(id, req.user.id);
  }

  @Post('chat')
  @Throttle(perMinute(THROTTLE_LIMITS.vocationalChat))
  @HttpCode(HttpStatus.OK)
  chat(@Request() req: any, @Body() dto: VocationalChatDto) {
    return this.chasideService.chat(req.user.id, dto);
  }

}
