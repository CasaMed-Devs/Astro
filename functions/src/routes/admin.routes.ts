import { Router } from 'express';

import { requireAdminAuth } from '../middleware/adminAuth.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { login, logout, session } from '../controllers/admin/auth.controller';
import {
  listAstrologers,
  updateAstrologerOrder,
  updateAstrologerPrice,
} from '../controllers/admin/astrologers.controller';
import { getPricing, updatePricing } from '../controllers/admin/pricing.controller';
import { getUserByUid, lookupUserByPhone } from '../controllers/admin/users.controller';

export const adminRouter = Router();

adminRouter.post('/login', asyncHandler(login));
adminRouter.post('/logout', requireAdminAuth, asyncHandler(logout));
adminRouter.get('/session', requireAdminAuth, asyncHandler(session));

adminRouter.get('/astrologers', requireAdminAuth, asyncHandler(listAstrologers));
adminRouter.patch('/astrologers/:profileId', requireAdminAuth, asyncHandler(updateAstrologerPrice));
adminRouter.put('/astrologers/order', requireAdminAuth, asyncHandler(updateAstrologerOrder));

adminRouter.get('/pricing', requireAdminAuth, asyncHandler(getPricing));
adminRouter.put('/pricing', requireAdminAuth, asyncHandler(updatePricing));

adminRouter.get('/users/lookup', requireAdminAuth, asyncHandler(lookupUserByPhone));
adminRouter.get('/users/:uid', requireAdminAuth, asyncHandler(getUserByUid));
