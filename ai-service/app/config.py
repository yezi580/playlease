"""ai-service 配置：统一从环境变量读取（12-factor 风格），本地开发用 .env 覆盖。

真实密钥只存在于服务器的 deploy/env/prod.env（gitignore 覆盖），git 里只有占位模板。
"""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _str(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name) or default)
    except (TypeError, ValueError):
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name) or default)
    except (TypeError, ValueError):
        return default


# ----- LLM（OpenAI 兼容接口，默认 DeepSeek） -----
LLM_BASE_URL = _str("AI_LLM_BASE_URL", "https://api.deepseek.com")
LLM_API_KEY = _str("AI_LLM_API_KEY")
LLM_MODEL = _str("AI_LLM_MODEL", "deepseek-chat")
LLM_TEMPERATURE = _float("AI_LLM_TEMPERATURE", 0.3)   # 低温度：客服问答要稳定不要发散
LLM_MAX_TOKENS = _int("AI_LLM_MAX_TOKENS", 1024)      # 控制单次回答成本上限

# ----- Embedding（可选；配置后启用「向量 + 词法」混合检索） -----
EMBEDDING_BASE_URL = _str("AI_EMBEDDING_BASE_URL")
EMBEDDING_API_KEY = _str("AI_EMBEDDING_API_KEY")
EMBEDDING_MODEL = _str("AI_EMBEDDING_MODEL")
EMBEDDING_CACHE_FILE = BASE_DIR / "cache" / "embeddings.json"  # 落盘缓存，避免每次重启重新付费向量化

# ----- 主站 Node 服务（工具调用的数据源） -----
NODE_BASE_URL = _str("NODE_BASE_URL", "http://localhost:3000")

# ----- 内部通信令牌：Node 转发请求时带 X-Internal-Token 头，这里校验 -----
SERVICE_TOKEN = _str("AI_SERVICE_TOKEN")

# ----- 调优参数 -----
RAG_TOP_K = _int("AI_RAG_TOP_K", 4)
MAX_TOOL_ROUNDS = _int("AI_MAX_TOOL_ROUNDS", 3)          # Function Calling 最大轮数，防死循环
MAX_INPUT_CHARS = _int("AI_MAX_INPUT_CHARS", 2000)       # 单条消息长度上限
HISTORY_LIMIT = _int("AI_HISTORY_LIMIT", 10)             # 携带的对话历史条数上限（省 token）

KNOWLEDGE_FILE = BASE_DIR / "knowledge" / "faq.md"
