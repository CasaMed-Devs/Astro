import { Router } from 'express';

import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { createChat, getMessages, sendMessage } from '../controllers/chat.controller';
import { getTodayHoroscope } from '../controllers/horoscope.controller';
import {
  createReportOrder,
  createSubscriptionOrder,
  verifyReportPayment,
  verifySubscriptionPayment,
} from '../controllers/payment.controller';
import { deleteAccount } from '../controllers/account.controller';
import { sendOtp, verifyOtpAndSignIn } from '../controllers/auth.controller';
import { getMe, updateBirthDetails, updateDisplayName } from '../controllers/user.controller';
import { getMyReport, getMySubscription } from '../controllers/status.controller';

export const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

router.post('/auth/send-otp', asyncHandler(sendOtp));
router.post('/auth/verify-otp', asyncHandler(verifyOtpAndSignIn));

router.get('/horoscopes/:sign/today', asyncHandler(getTodayHoroscope));

router.get('/me', requireAuth, asyncHandler(getMe));
router.post('/me/birth-details', requireAuth, asyncHandler(updateBirthDetails));
router.post('/me/display-name', requireAuth, asyncHandler(updateDisplayName));

router.get('/reports/me', requireAuth, asyncHandler(getMyReport));
router.get('/subscriptions/me', requireAuth, asyncHandler(getMySubscription));

router.post('/chats', requireAuth, asyncHandler(createChat));
router.get('/chats/:chatId/messages', requireAuth, asyncHandler(getMessages));
router.post('/chats/:chatId/messages', requireAuth, asyncHandler(sendMessage));

router.post('/payments/subscription/order', requireAuth, asyncHandler(createSubscriptionOrder));
router.post('/payments/subscription/verify', requireAuth, asyncHandler(verifySubscriptionPayment));
router.post('/payments/report/order', requireAuth, asyncHandler(createReportOrder));
router.post('/payments/report/verify', requireAuth, asyncHandler(verifyReportPayment));

router.post('/account/delete', requireAuth, asyncHandler(deleteAccount));
