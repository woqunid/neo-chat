import { toCanvas } from "html-to-image";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PDF_MARGIN_MM = 10;
const EXPORT_PIXEL_RATIO = 2;

interface RenderMessageCanvasOptions {
  root: HTMLElement;
  width: number;
  backgroundColor: string;
  filter: (node: HTMLElement) => boolean;
}

export async function renderMessageExportCanvas({
  root,
  width,
  backgroundColor,
  filter,
}: RenderMessageCanvasOptions): Promise<HTMLCanvasElement> {
  return toCanvas(root, {
    cacheBust: true,
    backgroundColor,
    width,
    pixelRatio: EXPORT_PIXEL_RATIO,
    style: { width: `${width}px` },
    filter: (node) => filter(node as HTMLElement),
  });
}

const canvasToBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("Failed to encode the exported image."));
    }, "image/png");
  });

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export async function downloadMessageCanvasAsPng(
  canvas: HTMLCanvasElement,
  filename: string,
) {
  downloadBlob(await canvasToBlob(canvas), filename);
}

const createPdfPageCanvas = (
  source: HTMLCanvasElement,
  offsetY: number,
  height: number,
) => {
  const pageCanvas = document.createElement("canvas");
  pageCanvas.width = source.width;
  pageCanvas.height = height;
  const context = pageCanvas.getContext("2d");
  if (!context) throw new Error("Failed to create the PDF page canvas.");
  context.drawImage(
    source,
    0,
    offsetY,
    source.width,
    height,
    0,
    0,
    source.width,
    height,
  );
  return pageCanvas;
};

export async function downloadMessageCanvasAsPdf(
  canvas: HTMLCanvasElement,
  filename: string,
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const contentWidth = A4_WIDTH_MM - PDF_MARGIN_MM * 2;
  const contentHeight = A4_HEIGHT_MM - PDF_MARGIN_MM * 2;
  const pagePixelHeight = Math.floor(
    (contentHeight * canvas.width) / contentWidth,
  );
  const pageCount = Math.ceil(canvas.height / pagePixelHeight);

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    if (pageIndex > 0) pdf.addPage();
    const offsetY = pageIndex * pagePixelHeight;
    const sliceHeight = Math.min(pagePixelHeight, canvas.height - offsetY);
    const pageCanvas = createPdfPageCanvas(canvas, offsetY, sliceHeight);
    const pageHeight = (sliceHeight * contentWidth) / canvas.width;
    pdf.addImage(
      pageCanvas.toDataURL("image/png"),
      "PNG",
      PDF_MARGIN_MM,
      PDF_MARGIN_MM,
      contentWidth,
      pageHeight,
      undefined,
      "FAST",
    );
  }

  pdf.save(filename);
}
