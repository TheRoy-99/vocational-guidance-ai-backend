import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeedbackService } from './feedback.service';

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
}
