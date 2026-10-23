import { Controller, Get } from '@nestjs/common';
import { AI_GUARDRAIL_VERSION } from '../chaside/services/chaside-ai.service';
import { IcfesService } from '../icfes/icfes.service';

/** Evidencia técnica pública; no recibe usuarios, archivos ni datos personales. */
@Controller('audit')
export class AuditController {
  constructor(private readonly icfesService: IcfesService) {}

  @Get('verification')
  verification() {
    return {
      generatedAt: new Date().toISOString(),
      icfesParser: this.icfesService.auditParserContract(),
      aiInterpretation: {
        status: 'implemented',
        guardrailVersion: AI_GUARDRAIL_VERSION,
        temperature: 0.2,
        evidence: 'El backend fija fidelidad numérica, anclaje a evidencia, confidencialidad y frontera de rol; las pruebas inspeccionan las directivas y etiquetas XML del prompt.',
      },
    };
  }
}
