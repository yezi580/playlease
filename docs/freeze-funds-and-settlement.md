# 资金冻结与汇付结算时效

> 记录客服后台「冻结资金」功能的资金链路、与汇付（Huifu）真实通道的对接方式，以及一项**必须遵守的运维硬约束**。
> 核查日期：2026-08-14。汇付官方文档来源见文末。

## 一、功能概述

「冻结资金」是客服在判定违规（如私下交易、绕开平台交付）时使用的一种**特殊裁决**：

- **押金退买家**（原路退款）
- **租金归平台**（不计入卖家收益）
- **卖家无收益**（不向卖家打款）

它是一个平台业务态，不是汇付侧的「资金冻结」动作。

## 二、资金链路与汇付通道

| 环节 | 实现 | 是否走汇付真实通道 |
| --- | --- | --- |
| 冻结动作本身 | 仅数据库改状态 `status=support_handling, support_scene=fund_frozen` | ❌ 不调汇付（汇付无此接口，见下） |
| 押金退买家 | `createOrderRefund` → 汇付 `htRefund`（托管交易退款，原路返回） | ✅ 真实汇付 |
| 租金归平台 | 只退押金、不退租金、不打卖家 → 资金留在平台汇付账户 | ✅（账户内残留即平台收益） |
| 卖家无收益 | 冻结结算时 `needsPayout=false`，不调 `acctpayment/pay` | ✅（无打款） |
| 结果对账 | `reconcileOrderFunds` → 汇付 `queryrefundinfo` | ✅ 真实汇付 |

**为什么冻结动作不调汇付：** 汇付的托管支付（统一收银台）流程只有四步——预下单、交易查询、交易退款、异步通知，**没有「冻结资金」接口**。买家付款那一刻资金已进入汇付体系，所谓「冻结」本质是平台**暂不发起退款/打款**，真实的资金锁是汇付账户里的待结算资金本身。

**关于分账：** 系统下单时**未传 `delay_acct_flag`**（该字段不传默认 `N`），即未使用汇付的「延迟户 / 延时分账」担保持有模型；也未在下单时传 `acct_split_bunch` 实时分账。给卖家的结算款是平台**另外用「余额支付」（`acctpayment/pay`）**从平台汇付账户转出，与托管收款是两套机制。

## 三、托管订单结算时效（核查结论）

托管支付资金属于**商户（平台）的应收**，其结算方式取决于**商户在汇付控台的结算配置**，与代码无关。汇付提供两种结算途径：

- **自动结算**：按规则自动划款到商户银行卡，周期支持 `D1`（次自然日）、`T1`（次工作日）、`TS`（秒到）。
- **手动取现**：由商户在控台或通过接口主动发起，`T1` / `D1` 到账。

**重要事实：**

- 汇付文档中**未规定**托管资金有「强制最长停留时限 / 超时自动结算」。
- 托管退款接口（`htRefund`）**未标注**明确退款期限，仅受底层支付渠道（微信/支付宝等）的原路退款窗口约束。

## 四、当前商户配置（核查于 2026-08-14）

商户汇付控台查询结果：

- 银行卡账户结算方式：**标准结算**
- **自动结算配置：未开启** ✅

含义：买家付款后资金**不会**在 D1/T1 自动划到平台银行卡，而是**一直停在平台汇付商户账户里**，只有平台主动发起**手动取现**才会流出。因此冻结期间资金是静止的，后续 `htRefund` 退押金时平台汇付账户有充足余额可扣——**冻结功能在当前配置下安全可用**。

生产环境通道配置（`deploy/env/prod.env`）：

- `PAYMENT_PROVIDER=huifu_cashier`（支付 + 退款走真实汇付）
- `WITHDRAW_PROVIDER=huifu_cashier`（取现走真实汇付）
- `PAYMENT_PROVIDER_STRICT_STARTUP_CHECK=true`（汇付配置缺失将阻止启动）

## 五、⚠️ 运维硬约束

> **自动结算必须保持「未开启」状态。**

**原因：** 一旦开启自动结算，买家付的款会在 D1/T1 自动划到平台银行卡。冻结期间资金已经离户（去了银行卡），后续冻结结算要 `htRefund` 原路退买家押金时，依赖平台汇付账户余额——**若余额被自动结算划空，退款可能因余额不足或风控失败**。

**配套运营要求：** 由于资金只靠手动取现流出，平台需自行管理现金流——**在有未结冻结订单、可能需要退款时，不要把汇付账户余额取现到不够退押金的程度**。万一取多导致退款余额不足，现有的对账机制（每 2 分钟 `reconcileProcessingFundsOrders` + 客服「同步资金结果」按钮）能及时发现并记录退款失败，不会静默丢钱。

**若未来必须开启自动结算：** 冻结后的退款须尽快执行（赶在 D1/T1 资金划走之前），并确保平台汇付账户保留足够退款备付金；或评估改造为「延时分账」（下单传 `delay_acct_flag=Y`，资金进延迟户、不可结算），但该模型与当前「余额支付打款」机制冲突，属较大架构改动，需慎重。

## 六、冻结 → 结算 → 对账 完整流程

1. **冻结**：客服在 SupportConsole 点「冻结资金」并填写原因 → `PUT /api/support/orders/:id/freeze-funds` → `freezeFundsBySupport`（分布式锁 + 事务 + 行锁 + 权限/状态校验）→ 订单进入 `support_handling + fund_frozen`。
2. **执行冻结结算**：客服点「执行分账」→ `executeSettlement` 冻结分支 → 退买家押金（`createOrderRefund` → `htRefund`）→ 资金处理中进入 `frozen_funds_processing` → 汇付确认成功后订单 `completed`、`support_scene=fund_frozen`。
3. **对账兜底**：每 120 秒 `reconcileProcessingFundsOrders` 自动扫描 `frozen_funds_processing` 订单，调汇付查单确认结果并推进；客服也可手动「同步资金结果」。
4. **解除冻结**（可选，争议排除时）：客服点「解除冻结」→ `releaseFrozenFundsBySupport` → 恢复到冻结前的正常状态（`paid` / `settlement_pending`）。

## 七、相关代码位置

| 职责 | 文件 | 关键函数 / 行 |
| --- | --- | --- |
| 冻结 / 解冻 / 冻结合算 | `server/modules/order/order-lifecycle.service.js` | `freezeFundsBySupport`(:1710)、`releaseFrozenFundsBySupport`(:1777)、`executeSettlement` 冻结分支(:1271)、`buildFrozenFundsSettlementPreview`(:324) |
| 客服路由 | `server/routes/support.routes.js` | `PUT /freeze-funds`(:840)、`PUT /release-funds`(:864) |
| 退款 / 打款 / 对账 | `server/modules/payment/payment.service.js` | `createOrderRefund`(:910)、`createSettlementPayout`(:1048)、`reconcileOrderFunds`(:1141)、`reconcileProcessingFundsOrders`(:1250) |
| 汇付通道（退款=htRefund、下单无 delay_acct） | `server/modules/payment/payment-provider.service.js` | `createRefund`(:808)、`createPaymentOrder`(:540) |
| 定时对账（120s） | `server/bootstrap/jobs.js` | `fundsReconcileIntervalMs` |
| 前端入口 | `src/components/SupportConsole.vue` | 冻结/解冻/同步/执行分账 按钮 |

## 八、参考来源（汇付官方文档）

- 托管支付联调流程（PC/H5）：`https://paas.huifu.com/help/dev_guide/jjfa/tg/pch5.md`
- 自动结算规则：`https://paas.huifu.com/partners/bzb/ythsk/js/zdjs.md`
- 手动取现规则：`https://paas.huifu.com/partners/bzb/ythsk/js/sdqx.md`
- 订单分账（含延迟户 / `delay_acct_flag` 说明）：`https://paas.huifu.com/partners/bzb/zhzjfw/ddfz/ddfz.md`
- 托管预下单 API（`delay_acct_flag` 默认 N）：`https://paas.huifu.com/partners/api/doc/cpjs/api_cpjs_hosting.md`
- 托管交易退款 API：`https://paas.huifu.com/partners/api/doc/cpjs/api_cpjs_hostingtk.md`
