import { Router } from 'express';

import { requireAdminAuth } from '../middleware/adminAuth.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { login, logout, session } from '../controllers/admin/auth.controller';
import {
  listAstrologers,
  updateAstrologerOrder,
} from '../controllers/admin/astrologers.controller';
import { getPricing, updatePricing } from '../controllers/admin/pricing.controller';
import { getDisputeData, getUserByUid, lookupUserByPhone } from '../controllers/admin/users.controller';
import { expire, give, reset } from '../controllers/admin/subscriptions.controller';
import { listLogs } from '../controllers/admin/logs.controller';

export const adminRouter = Router();

adminRouter.post('/login', asyncHandler(login));
adminRouter.post('/logout', requireAdminAuth, asyncHandler(logout));
adminRouter.get('/session', requireAdminAuth, asyncHandler(session));

adminRouter.get('/astrologers', requireAdminAuth, asyncHandler(listAstrologers));
adminRouter.put('/astrologers/order', requireAdminAuth, asyncHandler(updateAstrologerOrder));

adminRouter.get('/pricing', requireAdminAuth, asyncHandler(getPricing));
adminRouter.put('/pricing', requireAdminAuth, asyncHandler(updatePricing));

adminRouter.get('/users/lookup', requireAdminAuth, asyncHandler(lookupUserByPhone));
adminRouter.get('/users/dispute', requireAdminAuth, asyncHandler(getDisputeData));
adminRouter.get('/users/:uid', requireAdminAuth, asyncHandler(getUserByUid));

adminRouter.post('/subscriptions/give', requireAdminAuth, asyncHandler(give));
adminRouter.post('/subscriptions/reset', requireAdminAuth, asyncHandler(reset));
adminRouter.post('/subscriptions/expire', requireAdminAuth, asyncHandler(expire));

adminRouter.get('/logs', requireAdminAuth, asyncHandler(listLogs));
