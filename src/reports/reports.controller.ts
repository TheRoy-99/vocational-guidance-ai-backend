import { Controller, Get, Param, Request, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('vocational/:assessmentId/pdf')
  async vocationalPdf(@Param('assessmentId') assessmentId: string, @Request() request: any, @Res() response: Response) {
    const pdf = await this.reportsService.createVocationalPdf(assessmentId, request.user.id);
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="orientaai-reporte-${assessmentId}.pdf"`,
      'Content-Length': pdf.length,
      'Cache-Control': 'private, no-store',
    });
    response.end(pdf);
  }
}
