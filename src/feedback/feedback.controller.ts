import { Body, Controller, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeedbackService } from './feedback.service';
import type { AssessmentFeedbackInput } from './feedback.service';

@UseGuards(JwtAuthGuard)
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  async create(@Request() req: any, @Body() body: any) {
    const userId = req.user?.id ?? null;
    const record = await this.feedbackService.save({
      userId,
      source: body.source ?? 'UNKNOWN',
      rating: typeof body.rating === 'number' ? body.rating : null,
      message: body.message ?? null,
      metadata: body.metadata ?? null,
    });

    return { success: true, record };
  }

  @Post('assessment')
  async createAssessmentFeedback(@Request() req: any, @Body() body: AssessmentFeedbackInput) {
    return this.feedbackService.saveAssessmentFeedback(req.user.id, body);
  }

  @Post('assessment/:id/events')
  async addAssessmentFeedbackEvent(@Request() req: any, @Param('id') id: string, @Body() body: { eventType: string; position?: number }) {
    return this.feedbackService.addEvent(req.user.id, id, body.eventType, body.position);
  }

  @Patch('assessment/:id')
  async updateAssessmentFeedback(@Request() req: any, @Param('id') id: string, @Body() body: Omit<AssessmentFeedbackInput, 'idempotencyKey'>) {
    return this.feedbackService.updateAssessmentFeedback(req.user.id, id, body);
  }
}
