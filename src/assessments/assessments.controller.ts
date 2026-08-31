import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Delete,
  Patch,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AssessmentsService } from './assessments.service';
import { CreateAssessmentAnswerDto, CreateAssessmentEventDto, CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('assessments')
@UseGuards(JwtAuthGuard)
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateAssessmentDto, @Request() req: any) {
    return this.assessmentsService.create(req.user.id, dto);
  }

  @Get('me')
  async findMyAssessments(@Request() req: any) {
    return this.assessmentsService.findAll(req.user.id);
  }

  @Post(':id/answers')
  async addAnswer(@Param('id') id: string, @Body() dto: CreateAssessmentAnswerDto, @Request() req: any) {
    return this.assessmentsService.addAnswer(id, req.user.id, dto);
  }

  @Post(':id/events')
  async addEvent(@Param('id') id: string, @Body() dto: CreateAssessmentEventDto, @Request() req: any) {
    return this.assessmentsService.addEvent(id, req.user.id, dto);
  }

  @Post(':id/finalize')
  async finalize(@Param('id') id: string, @Body() dto: CreateAssessmentDto, @Request() req: any) {
    return this.assessmentsService.finalize(id, req.user.id, dto);
  }

  @Get(':id/results')
  async getVocationalResults(@Param('id') id: string, @Request() req: any) {
    const assessment = await this.assessmentsService.findById(id, req.user.id);
    return {
      assessmentId: assessment.id,
      createdAt: assessment.createdAt,
      assessmentType: assessment.assessmentType,
      profile: assessment.vocationalProfile,
      results: assessment.vocationalResults,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.assessmentsService.findById(id, req.user.id);
  }
  
  @Get(':id/analysis')
  async getAnalysis(@Param('id') id: string, @Request() req: any) {
    const assessment = await this.assessmentsService.findById(id, req.user.id);
    
    // Parsear el análisis guardado en JSON
    let analysis;
    if (assessment.aiAnalysis) {
      try {
        analysis = JSON.parse(assessment.aiAnalysis);
      } catch {
        analysis = { error: 'No se pudo parsear el análisis' };
      }
    }

    return {
      assessmentId: assessment.id,
      createdAt: assessment.createdAt,
      ...analysis,
    };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAssessmentDto,
    @Request() req: any,
  ) {
    return this.assessmentsService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.assessmentsService.remove(id, req.user.id);
  }
}
