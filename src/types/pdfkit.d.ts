declare module 'pdfkit' {
  type DocumentOptions = Record<string, unknown>;
  class PDFDocument {
    constructor(options?: DocumentOptions);
    on(event: string, listener: (...args: any[]) => void): this;
    fontSize(size: number): this;
    font(name: string): this;
    fillColor(color: string): this;
    strokeColor(color: string): this;
    lineWidth(width: number): this;
    text(text: string, x?: number, y?: number, options?: Record<string, unknown>): this;
    text(text: string, options?: Record<string, unknown>): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    stroke(): this;
    rect(x: number, y: number, width: number, height: number): this;
    roundedRect(x: number, y: number, width: number, height: number, radius: number): this;
    fill(color?: string): this;
    fillAndStroke(fill?: string, stroke?: string): this;
    addPage(options?: Record<string, unknown>): this;
    end(): void;
    moveDown(lines?: number): this;
    page: { width: number; height: number };
    y: number;
  }
  export = PDFDocument;
}
