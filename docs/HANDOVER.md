# 项目交接文档

> 最后更新：2026-09-15。本文档是全站交接的总索引：资产账号、部署运维、资金规则、代码陷阱、日常运营、待办事项。
> 部署细节以 [`deploy/PROD_DEPLOY.md`](../deploy/PROD_DEPLOY.md) 为准，资金规则细节以 [`docs/freeze-funds-and-settlement.md`](./freeze-funds-and-settlement.md) 为准，本文不重复展开、只做摘要与索引。

## 1. 项目概览

- **业务**：三角洲行动游戏账号租赁平台（买家按日租号、押金托管、客服分账结算），品牌名「西游商行」
- **主站**：https://xysh88.com ；**管理后台**：https://admin.xysh88.com （IP 白名单 + Passkey 二次校验）
- **技术栈**：
  - 前端：Vue 3 + Vite（主站 `src/` + `index.html`；后台 `src-admin/` + `admin.html`，同仓库两个入口）
  - 后端：Node.js + Express + MySQL 8 + Redis + Socket.IO（`server/`）
  - 部署：Docker Compose（服务器自建 MySQL/Redis/nginx），蓝绿双 api 容器零停机发布
- **后端结构**：`server/modules/`（audit / auth / business-settings / chat / listing / notification / order / payment 八个模块）+ `server/routes/`（admin / auth / conversation / feedback / listing / my-listings / notification / order / payment / support-listing-review / support / upload）
- **第三方依赖**：汇付支付（托管分账）、腾讯云 COS（文件存储）、腾讯云短信、腾讯云验证码、百度站长平台

## 2. 资产与账号清单（逐项交接，缺一不可）

| 资产 | 内容 | 备注 |
|---|---|---|
| 腾讯云服务器 | 49.235.59.19（内网 172.17.16.15），项目目录 `/opt/my-app` | SSH root 密钥 `D:\pic\only_key.pem`，需转移给接手方 |
| 域名 | `xysh88.com`、`admin.xysh88.com` | 注册商账号 + DNS 解析管理权一并交接 |
| HTTPS 证书 | 4 个文件在服务器 `deploy/nginx/certs/prod/`（主站 + 后台双证书） | 不在 git 里；**证书续期账号/流程**必须单独交接 |
| GitHub 仓库 | `github.com/yezi580/zuhao`（私有） | 转移所有权或加管理员协作者 |
| 汇付商户 | 商户控台登录、商户号、`HUIFU_*` 密钥 | ⚠️ 控台「**自动结算必须保持关闭**」：冻结退款依赖资金停留在平台汇付账户，开了会在 D1/T1 划走资金导致退款失败（详见 freeze-funds-and-settlement.md） |
| 腾讯云 COS | 子账号 SecretId/Key、bucket、region | 含数据万象（WebP 变体）、内网回源、`coscmd` 备份上传 |
| 腾讯云短信 | SecretId/Key、签名、模板 | 模板 2717710（买家支付成功通知号主，无变量固定文案，审核通过即自动生效无需部署） |
| 腾讯云验证码 | Captcha SecretId/Key | 注册/登录防护 |
| 百度站长平台 | ziyuan.baidu.com 账号 | 站点已验证（2026-09-09），API 推送 token 见 §9.3 |
| 管理后台超管 | 手机号 + 密码 + Passkey | 交接后立即用 `reset-prod-admin.sh` 换号换密码 |

## 3. 生产环境与密钥

### 3.1 环境文件

- **真实生产密钥只在服务器** `deploy/env/prod.env`（git 里是模板）；git 仓库当前干净（.env.example 全占位符）
- 数据库凭据：应用走最小权限账号 `app_rw`，root 独立密码 `DB_ROOT_PASSWORD`；新凭据只存在服务器 `/root/my-app-db-credentials.txt`（600 权限）与 prod.env
- ⚠️ `app_rw` 权限**必须含 REFERENCES**（外键迁移需要，当初漏配导致启动崩溃循环，已踩坑修复）

### 3.2 后台访问白名单

- `admin.xysh88.com` 走 nginx IP 白名单 + 管理员 Passkey
- 白名单文件 `deploy/nginx/admin-allowlist.prod.conf` **由服务器上 `update-admin-allowlist.sh` 生成维护**，仓库里只是空模板——tar 部署若不带 exclude 会覆盖线上白名单导致后台对全网开放（历史真实发生过）
- 接手方办公/家宽 IP 要先加白：`bash deploy/scripts/update-admin-allowlist.sh add <IP>`（持久保存，**30 天自动失效**，重复 add 续期；服务器 cron 每日 04:17 过期清理）
- IP 变了进不了后台：跑同一个脚本即可

### 3.3 交接后必做（安全）

历史上生产 DB root 密码曾随 docker-compose.yml 推上 GitHub（已轮换失效，仅存于 14 个历史 blob），交接意味着更多经手人，**全部密钥再轮换一轮**：

1. `rotate-db-credentials.sh` 轮换 DB 密码
2. `JWT_SECRET`（轮换会踢掉所有登录会话，低峰期做）
3. COS / 汇付 / 短信 / 验证码密钥在各控台各自轮换
4. 服务器 SSH 换密钥或至少新增接手方公钥后移除旧钥
5. 汇付控台变更操作员/联系人

## 4. 部署与发布

### 4.1 标准发布流程（蓝绿零停机）

完整步骤见 `deploy/PROD_DEPLOY.md`，骨架：

```
本地: npm run build → 打精简 tar（deploy/dist/server，严格按 PROD_DEPLOY.md 的 --exclude 列表）
     → scp 上传服务器
服务器: bash deploy/scripts/remote-deploy-extract.sh   # 解压（绝不手工 rm/tar！）
       bash deploy/scripts/blue-green-deploy.sh deploy  # 构建→重建闲置色→等 healthy→nginx 切流量
回滚:  bash deploy/scripts/blue-green-deploy.sh switch  # 秒级切回旧色
状态:  bash deploy/scripts/blue-green-deploy.sh status
```

### 4.2 最高频的坑（每条都真实发生过）

| 坑 | 正确做法 |
|---|---|
| **服务器上没有 git** | 直接在服务器跑 deploy 会"发布成功但发的是旧代码"。必须本地构建 → tar → scp → extract 脚本 → 再 deploy |
| **解压必须用 remote-deploy-extract.sh** | 手工跑 PROD_DEPLOY.md 的命令块会删 certs/prod 子目录换 inode，nginx 挂载点脱离。文档里手工步骤仅作参考 |
| **bind mount inode 陷阱** | `dist` / `certs` / `server/uploads` / `upstream-backend.conf` 都挂载进容器。目录/文件本身 rm 后重建会换 inode，运行中容器看到脱离的旧目录（主站 403 / 蓝绿静默失效）。只清内容、保 inode；`upstream-backend.conf` 重写必须 `cat >` 原地写 |
| **勿对活跃色 `up --force-recreate`** | 会重启正在接流量的容器，回到有停机窗口的旧模式。`docker compose up -d` 仅用于首次部署/编排文件变更/全量重建 |
| **nginx 双份配置** | 生产实际挂载 `deploy/nginx/nginx.prod.conf`，根目录 `nginx/nginx.prod.conf` 是本地 compose 用的另一份，**改配置两份都要动** |
| 仅改 nginx conf 的轻量发布 | scp 到 /tmp → 服务器 `cat >` 原地覆盖 → 容器内 `nginx -t` → `nginx -s reload`（零停机，不用走 tarball） |
| 部署后验证 | 看 nginx 容器内 `/etc/nginx/conf.d/upstream.conf` 的 `down` 标记定活跃色（勿 grep 颜色名，down 行也含颜色名会误判）；前端验证 grep 容器内 `/usr/share/nginx/html/assets/` 的新 hash chunk（用 ASCII 标识符，ssh+grep 中文会 GBK 乱码） |
| 后台 API 只在 admin 域名可达 | 主域名 `/api/admin/` 设计性 404；且 docker NAT 源 IP，服务器本机 curl admin 域名仍 403。验证后端改动要在 api 容器内 `node -e "fetch(...)"` 打 localhost:3000 |

### 4.3 周期任务

- 双色并存时周期任务靠跨实例 Redis 锁互斥（`JOBS_LOCK_TTL_MS`），同一轮任务全局只跑一次
- 资金对账任务每 2 分钟跑（`reconcileProcessingFundsOrders`），退款/打款异步到账靠它收口
- 服务器 crontab：白名单过期清理（每日 04:17）已确认；`backup-prod.sh` 的定时频率交接时在服务器 `crontab -l` 确认一遍

## 5. 数据与备份

- **MySQL** 卷 `mysql_data_prod`（订单/资金/用户，核心资产）；**Redis** 卷 `redis_data_prod`（限流、任务锁）；`server/uploads` 8G+ 本地上传 + COS 媒体库
- 备份：`backup-prod.sh` = MySQL dump + uploads 打包 → 本地保留 N 天 + COS 兜底 14 天（coscmd 缺失时自动跳过 COS 只做本地）
- 交接时：当面盘一次**资金账**——汇付平台账户余额、在途冻结订单、待结算订单、钱包/取现待处理
- 遗留数据：4 张测试期订单（id 3/4/5/9）无真实支付，已用 `ORDER_LIFECYCLE_EFFECTIVE_FROM=2026-08-18`（prod.env）排除在生命周期自动化之外，勿手动触发其流转

## 6. 核心业务规则（资金相关，改代码前必读）

### 6.1 订单生命周期自动链（均 env 可调）

支付成功 →（48h 买家未确认上号自动履约）→ 租期结束 +3 天未申请结算自动进入结算 → 买家 24h 不申报转客服仲裁 → 卖家 48h 不处理视为确认 → 客服分账。真实按钮链：确认账号继续履约（verify）→ 申请结算（complete，T+1 起点）→ 申报表单 → 卖家确认 → 客服分账。

### 6.2 额外物品双边定价（2026-08-21 上线）

- 买家价 `saleItems.buyerUnitPriceInCent`（后台可配，仅高于卖家价时生效）与卖家价独立；买家按买家价从押金扣，卖家按卖家价全额入账，**差价归平台**
- **业务保密约束：买卖双方价格互不可见**——任何新接口/UI 不得把买家侧金额暴露给卖家（反之亦然）；客服/管理端可见全部。已按角色过滤的位置：`order-query.service.js` getOrderDetail、`order.routes.js` settlement-preview、`OrderDetail.vue`、`ListingDetail.vue`
- 买家价在下单时**快照**进 `order_item_snapshots.buyer_unit_price`（0=与卖家价一致，兼容旧订单）；后台改价只影响新订单
- 押金覆盖校验的文案必须通用化（不出现金额），否则向卖家泄露买家价

### 6.3 手动结单 payout_mode（2026-08-22 上线）

- 场景：卖家无法汇付进件 → 客服「手动结单」（`PUT /api/support/orders/:id/execute-settlement`，body `payoutMode:'manual'` + 必填 `manualNote`）
- 资金语义：买家押金**仍走汇付原路退款**；卖家应结款**不走汇付**，客服线下联系收款；平台应得留商户账户
- **`order_settlements.payout_mode` 必须持久化**：对账任务 120s 重入 executeSettlement 时不带 payoutMode 参数，靠 DB 标记避免给未进件卖家打款 400 卡死。新增类似字段时照抄此模式

### 6.4 冻结资金裁决（2026-08-22 上线）

按责任方分账（uB=物品买家价合计、uS=物品卖家价合计；**物品款无论责任方都照常给卖家、差价归平台**）：

| 责任方 | 买家退款 | 卖家所得 | 平台所得 |
|---|---|---|---|
| 卖家责任（默认） | 押金 − uB | uS | 租金 + 物品差价 |
| 买家责任 | 0 | 租金 + uS | 押金 − uS |

- `frozen_liable_party` 持久化在 order_settlements（普通结算为 NULL），与 payout_mode 同机制防重入
- 冻结超时告警 `frozen_timeout_total`，阈值 env `FROZEN_FUNDS_TIMEOUT_HOURS`（默认 48h）
- 交互：冻结单「执行分账」→ 裁决弹窗（责任方单选 + 金额预览 + 打款方式选择）；preview 接口 `mode=frozen&liableParty=`

### 6.5 客服分配与改派（2026-08-30 上线）

- 客服在支付时自动分配并绑定订单；**改派走管理后台订单页「改派」按钮**（Passkey 二次校验），**不要手改 DB**
- 客服账号降级时名下未结订单+售前咨询自动按最小负载转派给其他在职客服；无其他客服则拒绝降级
- 终态订单不改派（保留归属作历史统计）

## 7. 代码级注意事项

### 7.1 业务配置四副本（最易踩的静默坑）

`admin_business_settings` 加新字段必须同步 4 处（normalize 是白名单式重建，漏一处字段被静默剥掉）：

1. `server/modules/business-settings/runtime.js`（运行时，30s TTL 缓存）
2. `server/routes/admin.routes.js` 的 `DEFAULT_ADMIN_BUSINESS_SETTINGS` + normalize（**最易漏**：后台 GET/PUT 都走它，漏改则保存时静默丢弃）
3. `src/utils/businessSettings.js`（前端镜像）
4. `src/constants/ratioConfig.js` 是死代码，不用改但别误当真配置源

### 7.2 雪花 ID：仅约定，未实现（截至 2026-09-15）

- 2026-09-06 约定：**新表**不再用 AUTO_INCREMENT，改雪花算法（为分库分表做准备）；存量表不动
- 现状：全库 31 张表**全部仍是 AUTO_INCREMENT**，server 里**没有任何雪花生成器代码**，唯一痕迹是 `server/schema.sql:15` 的一行注释。约定后未建过新表，零落地
- 若将来实现，注意：64 位 ID 超出 JS Number 安全范围（2^53），**API 必须序列化为字符串**；生成器要处理时钟回拨（小幅等待、大幅报错）；「标准单号生成规则」（前缀/日期段/与主键是否合一）用户始终未定稿，实现前先确认，不要自行发明格式

### 7.3 时间：全站北京时间

- mysql/api 容器 TZ=Asia/Shanghai，my.cnf `default-time-zone='+08:00'`，`NOW()`/`new Date()` 落库均为北京墙钟
- 2026-08-18 已做一次性全库 DATETIME +8h 迁移；**`migrate-datetime-to-beijing.sh` 勿重复执行**（每次再 +8h）
- api 容器（alpine）shell `date` 显示 UTC 是缺 tzdata 的显示怪癖，Node 时区正确，以 `Intl.DateTimeFormat().resolvedOptions().timeZone` 为准

### 7.4 汇付集成陷阱

- **端点路径大小写敏感**：退款查单是 `/v2/trade/hosting/payment/queryRefundInfo`（驼峰 I）；曾配成全小写导致 404，退款查单从上线起从未成功过。对照：`htRefund`（驼峰 R）、`queryorderinfo`（全小写）、`close` 均正常。改 URL 对官方文档，别只改大小写风格
- **退款是异步到账**：htRefund 受理即返回处理中（trans_stat=P），渠道几分钟到几小时到账；对账任务查单确认 success 后自动关单。**「退款处理中」卡超 1 小时即异常**，先 `docker logs | grep 退款查单失败`
- 排障探针模式：scp 一段 mjs → `docker cp` 进 api 容器 → `node /tmp/xx.mjs` import payment-provider.service 用容器内真实 env 调 provider（中文勿进 ssh 命令行，GBK 乱码）
- 官方接口参考：GitHub `huifurepo/dg-payment-skills` 的 `references/` 目录，比 paas.huifu.com 文档站好抓

### 7.5 COS 媒体（2026-08-27 降流量改造已上线）

- `server/infrastructure/cos.js` 自研签名器：keyTime 按 24h 窗口对齐 → 窗口内 URL 确定性，浏览器缓存可命中（曾因每请求重签 + 原图直出导致外网下行 ~100G/周）
- **imageMogr2 陷阱**：处理参数必须无等号格式 `?imageMogr2/format/webp/thumbnail/500x%3E` 追加在签名后；`imageMogr2=<value>` 形式被 COS **静默忽略**（200 但返原图）；参数不参与签名，纳入签名会 403
- WebP 变体预设 thumb/mid/full（实测 876KB PNG→14KB），开关 `COS_IMAGE_VARIANTS_ENABLED`，服务端失败回退原图 + 前端 onerror 去参重试双保险
- 服务器与桶同地域（上海），`cos-internal.ap-shanghai` 内网回源免费；跨地域部署自动降级公网
- 前端统一走 `src/utils/media.js`（admin 端跨目录 import 同一份）；上传端 JPEG>400KB 压缩，视频不预取、点击才 Range 拉流

### 7.6 性能现状

2026-08 三档优化已全部上线（gzip、静态 1 年缓存、5 个新索引、`listing_hot_stats` 预聚合表、业务配置/用户信息 30s TTL 缓存、周期任务重入保护、敏感词正则预编译）。慢查询日志已开（`my.cnf` long_query_time=0.5），巡检脚本：`check-prod-mysql.sh` / `tail-prod-mysql-slowlog.sh` / `check-prod-host-metrics.sh`。

**有意未做**（流量上来再做）：Node cluster 多进程（socket.io 需 redis adapter）、巨石组件拆分（ProfileCenter 3000+ 行）、COS 受保护图改 302 直连（会削弱按文件鉴权）。

### 7.7 安全现状

2026-08-17 审计的 3 个 critical + 9 个高危 + 7 个中危**已全部修复上线**（支付态只由验签回调/主动查单驱动、伪造回调 400、DB 凭据轮换分家、客服资金操作 Passkey step-up、IP 白名单、押金超时仲裁链等）。剩余**低危加固项**未做：上传魔数校验、LIKE 转义、Math.random 文件名、密钥分家、CSP 收紧。WAF 当前流量级（~2000 req/天）不必买；真要买时**汇付回调路径必须加白**。

## 8. 本地开发环境

- 根目录 `docker-compose.yml` 起 mysql/redis/api/nginx 全套（mock 支付：`PAYMENT_PROVIDER=mock_payment`，自动 3s 成功）；环境文件 `deploy/env/dev.env` / `test.env`
- 生产编排独立在 `deploy/compose/docker-compose.prod.yml`（蓝绿双 api `api-blue`/`api-green`）
- 本地 Windows Docker Desktop 网络栈不可靠（exec 挂起、TLS 到不了容器），容器行为测试一律上服务器做
- Windows 下 curl 发中文 JSON 是 GBK 字节——本地测中文接口用 node fetch 脚本
- 功能测试可铸 JWT 直连 API：本地 JWT_SECRET 签发 `authLevel:'passkey'` + 新鲜 `stepUpVerifiedAt`

## 9. 日常运营流程

### 9.1 客服/后台日常

- 客服工作台：结算处理（普通/手动结单/冻结裁决三分支）、售前咨询、工单事件
- 管理后台：商品审核、订单管理（含改派）、业务参数配置、操作审计、在线人数/短信用量统计
- 改买家价/业务参数只影响新订单（快照机制）

### 9.2 短信

- 买家支付成功 → 短信通知号主（`order-sms.service.js`，按订单幂等、fire-and-forget 不影响订单）
- 验证：`docker logs <活跃色> 2>&1 | grep order-sms`
- ⚠️ 腾讯云**个人认证**通知类模板不允许变量；历史被拒词：账号/租/上号/付款/支付/尽快/交付/账号租赁——改文案避开这些词，否则审核被拒

### 9.3 SEO / 收录

- 百度站点已验证（2026-09-09）；验证文件 `public/baidu_verify_codeva-Ex40g0iHFV.html` 与首页 meta **勿删**
- 发版后主动推送（从生产服务器执行）：
  ```bash
  printf 'https://xysh88.com/\nhttps://xysh88.com/<新页面>\n' > /tmp/urls.txt
  curl -H 'Content-Type:text/plain' --data-binary @/tmp/urls.txt \
    'http://data.zz.baidu.com/urls?site=https://xysh88.com&token=39ruimrqTIw2cQKb'
  ```
  成功返回 `{"remain":N,"success":M}`；新站配额约 10 条/天。token 即百度站长平台「API 推送」页的凭据
- 必应走 IndexNow：key 文件 `public/78122a9dcbfb2e573919ccbfea6ae885.txt`，POST `https://api.indexnow.org/indexnow`（提交后 ~10 分钟必应就来抓，有效）
- 查爬虫真实日志：nginx 容器内 access.log 是软链，真身在宿主机 `docker inspect -f '{{.LogPath}}' my-app-prod-nginx-1`

### 9.4 改枪码页数据更新（GunCode.vue）

- 数据源：抖音「林天的改枪码大全」在线文档导出的 xlsx；用户会不定期给新版文件要求重刷
- **流水线脚本在本地 `D:\pic\`（不在仓库，需单独交接）**：`parse_guncode.py`（zip/XML 直解绕过 WPS 样式，openpyxl 会崩）→ `gen_guncode_js.py`（按列分组提取+归组+码校验）→ `splice_guncode.py`（替换 GunCode.vue 中 GUN_CODE_ENTRIES 区段）
- 列布局：A-C 步枪 / E-F-G 冲锋枪 / I-J-K 射手+狙击 / M-N-O 机枪+霰弹；**只要「烽火地带」sheet**，其它 sheet 不取
- 更新后按标准流程 tarball 部署

## 10. 待办 / 未完成事项

| 事项 | 状态 |
|---|---|
| 雪花 ID + 标准单号规则 | 仅约定未实现（见 §7.2），单号格式待定稿 |
| 低危安全加固（上传魔数、LIKE 转义、Math.random 文件名、密钥分家、CSP） | 未做，按需排期 |
| Node cluster / 组件拆分 / COS 受保护图直连 | 有意延后，流量上来再做 |
| 短信模板 2717710 | 审核通过即自动生效，无需部署；若一直未过审在控台看拒绝原因（避开 §9.2 禁忌词） |
| 百度收录 | 站点已验证但 Baiduspider 尚未开始抓（2026-09-13~15 零抓取记录），需在 ziyuan.baidu.com 用「抓取诊断」催 |
| favicon 在必应搜索结果 | 等 bingbot favicon 管线刷新（通常 1~4 周），无需操作 |

## 11. 交接验证清单（做完才算交出去）

- [ ] 接手方拿到并登入：服务器 SSH、GitHub、域名注册商、汇付控台、腾讯云 COS/短信/验证码、百度站长
- [ ] 接手方 IP 已加后台白名单且能打开 admin.xysh88.com
- [ ] 超管账号已换（`reset-prod-admin.sh`），接手方绑好自己的 Passkey
- [ ] 全部密钥轮换一轮（§3.3），主站/后台/支付回调/短信/COS 上传验证正常
- [ ] 接手方独立完成一次完整发布（build → tar → scp → extract → blue-green deploy）
- [ ] 做一次 `blue-green-deploy.sh switch` 回滚演练
- [ ] 从备份恢复一次 MySQL dump 到测试环境，确认备份可用
- [ ] 盘一次资金账：汇付余额、在途冻结/结算订单、钱包待提现
- [ ] `D:\pic\` 枪码流水线脚本与 SSH 密钥文件已拷给接手方
- [ ] 服务器 crontab（备份频率、白名单过期清理）与接手方过一遍
