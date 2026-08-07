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
  ensureListingDecontaminationChamberLevelSchema,
  ensureListingReviewSchema,
  ensureAdminOperationLogSchema,
  ensureAdminBusinessSettingsSchema,
  ensureUserFeedbackSchema,
  ensureListingClickUserSchema,
  ensureAdminOnlineSnapshotSchema,
  ensureUserNotificationSchema,
  ensureConversationSchema,
  ensureOrderSupportSchema,
  ensurePresaleSupportSchema,
  ensureOrderWorkflowSchema,
  ensureSupportEventSchema,
  ensureWalletSchema,
  ensureInviteSchema,
  ensureSmsSecuritySchema,
  ensureUploadQuotaSchema,
  ensureKycSchema,
  ensurePaymentChannelSchema,
  ensureSettlementPaymentSchema,
  refreshUploadSortOrderFlags
}) {
  await ensureUserRoleSchema()
  await ensureAdminPasskeySchema()
  await ensureAdminTrustedDeviceSchema()
  await ensureListingNumberSchema()
  await ensureBanMediaSchema()
  await ensureListingItemModeSchema()
  await ensureListingDecontaminationChamberLevelSchema()
  await ensureListingReviewSchema()
  await ensureAdminOperationLogSchema()
  await ensureAdminBusinessSettingsSchema()
  await ensureUserFeedbackSchema()
  await ensureListingClickUserSchema()
  await ensureAdminOnlineSnapshotSchema()
  await ensureUserNotificationSchema()
  await ensureConversationSchema()
  await ensureOrderSupportSchema()
  await ensurePresaleSupportSchema()
  await ensureOrderWorkflowSchema()
  await ensureSupportEventSchema()
  await ensureWalletSchema()
  await ensureInviteSchema()
  await ensureSmsSecuritySchema()
  await ensureUploadQuotaSchema()
  await ensureKycSchema()
  await ensurePaymentChannelSchema()
  await ensureSettlementPaymentSchema()
  await refreshUploadSortOrderFlags()
}
