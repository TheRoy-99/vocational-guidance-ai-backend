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
import { ChasideService } from './services/chaside.service';
import { SubmitAssessmentDto } from './dto/submit-assessment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('chaside')
export class ChasideController {
  constructor(private readonly chasideService: ChasideService) {}

  @Post('submit')
  @HttpCode(HttpStatus.ACCEPTED) // 202 — encolado, no procesado aún
  submit(@Request() req: any, @Body() dto: SubmitAssessmentDto) {
    return this.chasideService.submit(req.user.id, dto);
  }

  @Get('my-assessments')
  getMyAssessments(@Request() req: any) {
    return this.chasideService.getMyAssessments(req.user.id);
  }

  @Get(':id/results')
  getResults(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ) {
    return this.chasideService.getResults(id, req.user.id);
  }
}