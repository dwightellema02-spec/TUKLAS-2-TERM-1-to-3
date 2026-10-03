import { createApiHandler } from '../../../../../lib/api-handler';
import { ValidationError } from '../../../../../lib/errors';
import { DOCUMENT_LIMITS } from '../../../../../server/documents/extract';
import { DocumentService } from '../../../../../services/document.service';

/** The lesson's reference documents (teacher who owns the lesson, or an admin). */
export const GET = createApiHandler(
  async (_request, { user, params }) => ({ documents: await DocumentService.list(params!.id, user!) }),
  { requireAuth: true, allowedRoles: ['TEACHER', 'ADMIN'] },
);

/** Upload one PDF / DOCX / text file as multipart form data (field name "file"). */
export const POST = createApiHandler(
  async (request, { user, params }) => {
    // Refuse oversized bodies before reading them into memory (multipart adds a little overhead).
    const declared = Number(request.headers.get('content-length'));
    if (!Number.isFinite(declared) || declared <= 0) {
      throw new ValidationError('The upload size could not be determined.');
    }
    if (declared > DOCUMENT_LIMITS.maxBytes + 64 * 1024) {
      throw new ValidationError(`The file is larger than ${DOCUMENT_LIMITS.maxBytes / (1024 * 1024)} MB.`);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ValidationError('Send the document as multipart form data.');
    }
    const file = form.get('file');
    if (!(file instanceof File)) throw new ValidationError('Choose a file to upload.');

    const document = await DocumentService.add(params!.id, user!, {
      name: file.name,
      buffer: new Uint8Array(await file.arrayBuffer()),
    });
    return { document };
  },
  { requireAuth: true, allowedRoles: ['TEACHER', 'ADMIN'], successStatus: 201 },
);
