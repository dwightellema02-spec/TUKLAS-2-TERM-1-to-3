import { createApiHandler } from '../../../../../lib/api-handler';
import { ReplyReportService, replyReportSchema, type ReplyReportInput } from '../../../../../services/reply-report.service';

/** A student reports a tutor reply as wrong, confusing, unsafe or otherwise bad. */
export const POST = createApiHandler<unknown, ReplyReportInput>(
  async (_request, { user, body }) => ReplyReportService.report(user!.id, body),
  { requireAuth: true, allowedRoles: ['STUDENT'], bodySchema: replyReportSchema, successStatus: 201 },
);
