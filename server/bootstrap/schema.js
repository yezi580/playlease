/**
 * 启动阶段使用的数据库结构初始化工具。
 */

export async function runBootstrapSchemaTasks({
  ensureUserRoleSchema,
  ensureAdminPasskeySchema,
  ensureAdminTrustedDeviceSchema,
  ensureListingNumberSchema,
  ensureBanMediaSchema,
  ensureListingItemModeSchema,
  ensureListingReviewSchema,
  ensureAdminOperationLogSchema,
  ensureAdminBusinessSettingsSchema,
  ensureUserFeedbackSchema,
  ensureListingClickUserSchema,
  ensureAdminOnlineSnapshotSchema,
  ensureUserNotificationSchema,
  ensureConversationSchema,
  ensureOrderSupportSchema,
  ensureOrderWorkflowSchema,
  ensureSupportEventSchema,
  ensureWalletSchema,
  ensureInviteSchema,
  ensureSmsSecuritySchema,
  ensureKycSchema,
  ensurePaymentChannelSchema,
  refreshUploadSortOrderFlags
}) {
  await ensureUserRoleSchema()
  await ensureAdminPasskeySchema()
  await ensureAdminTrustedDeviceSchema()
  await ensureListingNumberSchema()
  await ensureBanMediaSchema()
  await ensureListingItemModeSchema()
  await ensureListingReviewSchema()
  await ensureAdminOperationLogSchema()
  await ensureAdminBusinessSettingsSchema()
  await ensureUserFeedbackSchema()
  await ensureListingClickUserSchema()
  await ensureAdminOnlineSnapshotSchema()
  await ensureUserNotificationSchema()
  await ensureConversationSchema()
  await ensureOrderSupportSchema()
  await ensureOrderWorkflowSchema()
  await ensureSupportEventSchema()
  await ensureWalletSchema()
  await ensureInviteSchema()
  await ensureSmsSecuritySchema()
  await ensureKycSchema()
  await ensurePaymentChannelSchema()
  await refreshUploadSortOrderFlags()
}
