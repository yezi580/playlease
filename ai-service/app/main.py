"""FastAPI 入口：POST /api/chat（SSE 流式对话）+ GET /health（容器健康检查）。

部署形态：容器不直接暴露公网，浏览器请求 → nginx → Node 主服务（统一鉴权/限流）
→ 内网 fetch 到本服务（带 X-Internal-Token）。这样 AI 能力天然继承主站的安全体系。
"""
import logging
import secrets
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from . import config
from .chat import chat_sse
from .rag import HybridRetriever

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

retriever = HybridRetriever()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # 启动时建好检索索引（几十条 FAQ，秒级）；语料变了改 faq.md 重启即生效
    await retriever.load()
    yield


app = FastAPI(title="xysh88-ai-service", lifespan=lifespan)


class Message(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]


def _check_internal_token(token: str | None) -> None:
    """共享秘钥校验。compare_digest 防时序攻击；未配置 token 时跳过（仅限本地开发）。"""
    if config.SERVICE_TOKEN and not secrets.compare_digest(token or "", config.SERVICE_TOKEN):
        raise HTTPException(status_code=401, detail="invalid internal token")


@app.post("/api/chat")
async def chat(request: ChatRequest, x_internal_token: str | None = Header(default=None)):
    _check_internal_token(x_internal_token)
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages 不能为空")
    return StreamingResponse(
        chat_sse([message.model_dump() for message in request.messages], retriever),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # 告诉 nginx 对这条响应关闭缓冲，SSE 才能实时逐字下发（配 proxy_buffering off 双保险）
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/health")
async def health():
    return JSONResponse(
        {
            "ok": retriever.ready,
            "llm": bool(config.LLM_API_KEY),
            "embedding": bool(config.EMBEDDING_API_KEY),
            "rag": {"chunks": len(retriever.chunks), "mode": retriever.mode},
        }
    )


@app.get("/")
async def root():
    return {"service": "xysh88-ai-service", "docs": "/docs"}
