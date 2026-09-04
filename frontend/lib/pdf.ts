// Shared canvas -> PDF/PNG export helpers.
//
// Used by the calculator report and the meal-chart download. Both render a DOM
// node to a canvas via html2canvas, then either save it as a PNG or fit it onto
// A4 pages. Tall content (a 31-day meal chart) is sliced across multiple pages
// so it stays legible instead of being crushed onto one sheet.
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const PAGE_MARGIN = 16; // pt

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function captureNode(
  node: HTMLElement | null
): Promise<HTMLCanvasElement | null> {
  if (!node) return null;
  return await html2canvas(node, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
  });
}

export async function captureToPng(
  node: HTMLElement | null,
  filename: string
): Promise<boolean> {
  const canvas = await captureNode(node);
  if (!canvas) return false;
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );
  if (!blob) return false;
  triggerDownload(blob, filename);
  return true;
}

interface PdfOptions {
  filename: string;
  /** Omit to pick automatically from the canvas aspect ratio. */
  orientation?: "portrait" | "landscape";
  /** Slice tall content across pages instead of shrinking it to fit one. */
  multiPage?: boolean;
}

export async function captureToPdf(
  node: HTMLElement | null,
  { filename, orientation, multiPage = false }: PdfOptions
): Promise<boolean> {
  const canvas = await captureNode(node);
  if (!canvas) return false;

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation:
      orientation ?? (canvas.width > canvas.height ? "landscape" : "portrait"),
    unit: "pt",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const availableWidth = pageWidth - PAGE_MARGIN * 2;
  const availableHeight = pageHeight - PAGE_MARGIN * 2;
  const ratio = canvas.width / canvas.height;

  if (!multiPage) {
    // Single page: scale down to fit entirely, centered horizontally.
    let renderWidth = availableWidth;
    let renderHeight = renderWidth / ratio;
    if (renderHeight > availableHeight) {
      renderHeight = availableHeight;
      renderWidth = renderHeight * ratio;
    }
    pdf.addImage(
      imgData,
      "PNG",
      (pageWidth - renderWidth) / 2,
      PAGE_MARGIN,
      renderWidth,
      renderHeight
    );
    pdf.save(filename);
    return true;
  }

  // Multi-page: lock the image to the full available width, then walk down it
  // one page-height at a time. Each page draws the same image shifted upward so
  // only that slice lands inside the page box.
  const renderWidth = availableWidth;
  const renderHeight = renderWidth / ratio;
  const pageCount = Math.max(1, Math.ceil(renderHeight / availableHeight));

  for (let page = 0; page < pageCount; page++) {
    if (page > 0) pdf.addPage();
    const offsetY = PAGE_MARGIN - page * availableHeight;
    // Clip to the printable box so the overflow of neighbouring slices is hidden.
    pdf.saveGraphicsState();
    // jsPDF exposes rect+clip at runtime but omits them from the public types,
    // so we cast through unknown for the missing overloads.
    (pdf as unknown as { rect: (x: number, y: number, w: number, h: number, s: "S" | "F" | null) => void })
      .rect(PAGE_MARGIN, PAGE_MARGIN, availableWidth, availableHeight, null);
    (pdf as unknown as { clip: () => void }).clip();
    pdf.addImage(imgData, "PNG", PAGE_MARGIN, offsetY, renderWidth, renderHeight);
    pdf.restoreGraphicsState();
  }

  pdf.save(filename);
  return true;
}
