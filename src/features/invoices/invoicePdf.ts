import { Platform } from 'react-native';
import type { File as FileSystemFile } from 'expo-file-system';

import { buildInvoiceHtml, INVOICE_PAGE } from '@/features/invoices/invoiceHtml';
import type { Invoice } from '@/services/invoice.service';
import { AppError } from '@/utils/errors';

const PDF_MIME_TYPE = 'application/pdf';

export type InvoiceDownloadResult = 'saved' | 'shared' | 'cancelled';

export function getInvoiceFileName(invoice: Invoice): string {
  return `${invoice.appName}-Invoice-${invoice.invoiceNumber}.pdf`.replace(/[^A-Za-z0-9._-]/g, '_');
}

/**
 * Loaded lazily, like react-native-razorpay in payment.service.ts: an app
 * binary built before these native modules were added doesn't contain them,
 * and a top-level import would crash the whole invoice screen instead of
 * just failing the download.
 */
async function loadPdfModules() {
  try {
    const [Print, Sharing, FileSystem] = await Promise.all([
      import('expo-print'),
      import('expo-sharing'),
      import('expo-file-system'),
    ]);
    return { Print, Sharing, FileSystem };
  } catch {
    throw new AppError('unknown', 'Please update the app to download invoices.');
  }
}

/** Renders the invoice to a PDF in the cache directory, named after its invoice number. */
async function createInvoicePdf(invoice: Invoice): Promise<FileSystemFile> {
  const { Print, FileSystem } = await loadPdfModules();

  const { uri } = await Print.printToFileAsync({
    html: buildInvoiceHtml(invoice),
    ...INVOICE_PAGE,
  });

  // expo-print picks a random file name; give it the one the user should see.
  const pdf = new FileSystem.File(FileSystem.Paths.cache, getInvoiceFileName(invoice));
  if (pdf.exists) pdf.delete();
  await new FileSystem.File(uri).move(pdf);
  return pdf;
}

/** Opens the system share sheet with the invoice PDF attached. */
export async function shareInvoicePdf(invoice: Invoice): Promise<void> {
  const { Sharing } = await loadPdfModules();
  const pdf = await createInvoicePdf(invoice);

  if (!(await Sharing.isAvailableAsync())) {
    throw new AppError('unknown', 'Sharing is not available on this device.');
  }
  await Sharing.shareAsync(pdf.uri, {
    mimeType: PDF_MIME_TYPE,
    UTI: 'com.adobe.pdf',
    dialogTitle: invoice.invoiceNumber,
  });
}

/**
 * Saves the invoice PDF to a folder the user picks (Android), or hands it to
 * the share sheet, whose "Save to Files" is the equivalent elsewhere.
 */
export async function downloadInvoicePdf(invoice: Invoice): Promise<InvoiceDownloadResult> {
  if (Platform.OS !== 'android') {
    await shareInvoicePdf(invoice);
    return 'shared';
  }

  const { FileSystem } = await loadPdfModules();
  const pdf = await createInvoicePdf(invoice);

  let folder;
  try {
    folder = await FileSystem.Directory.pickDirectoryAsync();
  } catch {
    // The picker rejects when the user backs out of it.
    return 'cancelled';
  }

  const saved = folder.createFile(getInvoiceFileName(invoice), PDF_MIME_TYPE);
  saved.write(await pdf.bytes());
  return 'saved';
}
