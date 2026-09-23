declare module 'pdfmake/build/pdfmake' {
  interface PdfMake {
    addFontContainer(container: unknown): void;
    createPdf(docDefinition: Record<string, unknown>): {
      getBlob(): Promise<Blob>;
    };
  }

  const pdfMake: PdfMake;
  export default pdfMake;
}

declare module 'pdfmake/build/standard-fonts/Helvetica' {
  const fontContainer: unknown;
  export default fontContainer;
}
