# ai-service —— 西游商行 AI 助手微服务

给主站提供「AI 助手」能力的独立 Python 服务：**RAG 平台规则问答 + Function Calling 智能选号**。

## 架构位置

```
浏览器 ──SSE──> nginx ──> Node 主服务(/api/ai/chat，统一鉴权+限流)
                                └──内网 fetch + X-Internal-Token──> ai-service(本服务，8000)
                                        ├─ RAG：knowledge/faq.md 检索注入
                                        ├─ LLM：DeepSeek 等 OpenAI 兼容接口（流式）
                                        └─ 工具：HTTP 回调 Node 的 /api/listings 查商品
```

不直接暴露公网；密钥只存在于服务器 `deploy/env/prod.env`（gitignore 覆盖），git 里只有 `.env.example` 占位。

## 本地开发

```bash
cd ai-service
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt

copy .env.example .env          # 填 AI_LLM_API_KEY（必填）；Embedding 三项可不填（自动退化为纯词法检索）
uvicorn app.main:app --reload --port 8000
```

验证：`http://localhost:127.0.0.1:8000/health`（本地还需主站 Node 在 3000 端口跑着，工具才能查到商品）。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/chat` | SSE 流式对话。请求体 `{"messages":[{"role":"user","content":"..."}]}`；头 `X-Internal-Token`（配置了才校验） |
| GET | `/health` | 健康检查：llm/embedding 是否配置、知识库条数、检索模式 |

SSE 事件协议见 `app/chat.py` 顶部注释：`sources` / `delta` / `tool_call` / `tool_result` / `done` / `error`。

## 目录导览

```
app/
  config.py   环境变量集中读取
  rag.py      知识库加载 + 混合检索（字级bigram TF-IDF + 可选向量，含缓存与降级）
  tools.py    Function Calling 工具（search_listings / get_listing_detail，只读不碰资金）
  chat.py     对话编排：RAG 注入 + 工具循环 + SSE 流式
  main.py     FastAPI 入口
knowledge/faq.md   RAG 语料（⚠️ 只放用户可见的公开规则，内部机密不入库）
```

## 运维要点

- 改 `knowledge/faq.md` 后重启即生效；配了 Embedding 时语料指纹（md5）变化会自动重新向量化
- `cache/embeddings.json` 是语料向量缓存，删掉会触发重新付费向量化（很便宜，几十条一次几厘钱）
- 部署：单容器、不参与蓝绿；更新 = 服务器上 `docker compose ... up -d --build ai-service`
