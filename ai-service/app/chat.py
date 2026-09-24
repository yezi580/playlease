"""对话编排层：RAG 上下文注入 + Function Calling 循环 + SSE 流式输出。

一次 /api/chat 请求的生命周期：
  1. 取最后一条用户消息做 RAG 检索，命中的知识库片段注入 system prompt（发给前端 sources 事件）
  2. 流式请求 LLM，每个 delta 实时下发给前端（SSE）——用户看到"逐字打出"的效果
  3. 若模型决定调工具：本地执行 → 结果作为 tool 消息回喂 → 继续生成（最多 MAX_TOOL_ROUNDS 轮）
  4. 结束发 done 事件；任何异常发 error 事件，绝不让流中途裸断

SSE 事件协议（前端按 type 渲染）：
  sources     检索命中的知识条目标题（可展示"参考来源"）
  delta       回答文本片段（增量）
  tool_call   模型决定调用某工具（可展示"正在查询商品…"）
  tool_result 工具执行结果（前端可把商品结果渲染成卡片）
  done / error 收尾
"""
import json
import logging
from typing import AsyncIterator

from openai import AsyncOpenAI

from . import config, tools
from .rag import HybridRetriever

logger = logging.getLogger("chat")

SYSTEM_PROMPT = """你是「西游商行」（xysh88.com）的 AI 助手。这是一个《三角洲行动》游戏账号租赁平台：号主按天出租账号，玩家租用，平台通过第三方支付托管资金并提供担保。

## 回答规则
1. 只回答与本平台、三角洲行动、账号租用相关的问题；无关问题礼貌拒答并说明你只能帮平台相关问题。
2. 优先依据下面的「平台知识库」回答，自然注明依据（如：按平台规则，……）。
3. 知识库和工具结果都没有答案时，明确说不知道，建议用户通过页面「售前咨询」联系人工客服。禁止编造规则、金额、时限。
4. 涉及资金、退款、处罚的结论一律以订单页面展示和客服裁决为准，不替平台做任何承诺。
5. 找号/选号/比价类请求：调用 search_listings 工具，基于返回结果客观介绍（报租金时说明"买家实付约为标价×1.1，以页面为准"），没搜到就如实说，不编造商品。
6. 用户问某个具体编号的商品时：调用 get_listing_detail。
7. **调用工具前不要输出任何前置说明**（禁止 I'll search... / Let me check... 之类过渡句），直接调用，拿到结果后直接组织回答。
8. 全程只用简体中文，简洁分点，不啰嗦；可以适度使用 Markdown 列表。

{knowledge_block}"""

_KNOWLEDGE_HEADER = "## 平台知识库（本轮检索命中，仅供参考，以页面实际展示为准）"

_llm_client: AsyncOpenAI | None = None


def _get_llm_client() -> AsyncOpenAI:
    """懒初始化的 OpenAI 兼容客户端（DeepSeek 等任何兼容服务都只差 base_url）。"""
    global _llm_client
    if _llm_client is None:
        _llm_client = AsyncOpenAI(base_url=config.LLM_BASE_URL, api_key=config.LLM_API_KEY)
    return _llm_client


def _sanitize_messages(messages: list[dict]) -> list[dict]:
    """白名单式清洗：只留 user/assistant 文本，截断超长内容，砍掉过老的历史。
    前端传来的任何字段都不能直接信任。"""
    kept = []
    for message in messages or []:
        role = message.get("role")
        content = str(message.get("content") or "")[: config.MAX_INPUT_CHARS]
        if role in ("user", "assistant") and content.strip():
            kept.append({"role": role, "content": content})
    return kept[-config.HISTORY_LIMIT :]


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _safe_json(text: str):
    try:
        return json.loads(text or "{}")
    except json.JSONDecodeError:
        return text


async def chat_sse(messages: list[dict], retriever: HybridRetriever) -> AsyncIterator[str]:
    if not config.LLM_API_KEY:
        yield _sse({"type": "error", "message": "AI 服务尚未配置模型密钥，请联系管理员"})
        return

    history = _sanitize_messages(messages)
    if not history:
        yield _sse({"type": "error", "message": "消息不能为空"})
        return

    # ---- 1. RAG 检索（用最后一条用户消息）----
    last_user_text = next(
        (m["content"] for m in reversed(history) if m["role"] == "user"), ""
    )
    hits = await retriever.search(last_user_text) if last_user_text else []
    if hits:
        yield _sse({"type": "sources", "sources": [{"title": hit["title"]} for hit in hits]})
        knowledge = "\n\n".join(f"### {hit['title']}\n{hit['text']}" for hit in hits)
        system_prompt = SYSTEM_PROMPT.format(
            knowledge_block=f"{_KNOWLEDGE_HEADER}\n\n{knowledge}"
        )
    else:
        system_prompt = SYSTEM_PROMPT.format(
            knowledge_block="（本轮未检索到相关知识。不确定的问题如实说不知道，引导用户走售前咨询人工客服。）"
        )

    convo = [{"role": "system", "content": system_prompt}, *history]

    # ---- 2/3. 生成 + 工具循环 ----
    for _round in range(config.MAX_TOOL_ROUNDS):
        content_parts: list[str] = []
        tool_calls_acc: dict[int, dict] = {}
        try:
            stream = await _get_llm_client().chat.completions.create(
                model=config.LLM_MODEL,
                messages=convo,
                tools=tools.TOOL_SCHEMAS,
                temperature=config.LLM_TEMPERATURE,
                max_tokens=config.LLM_MAX_TOKENS,
                stream=True,
            )
            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta is None:
                    continue
                if delta.content:
                    content_parts.append(delta.content)
                    yield _sse({"type": "delta", "text": delta.content})
                # 流式工具调用会按 index 分片到达，需要手动拼装
                for tool_call in delta.tool_calls or []:
                    slot = tool_calls_acc.setdefault(
                        tool_call.index, {"id": "", "name": "", "arguments": ""}
                    )
                    if tool_call.id:
                        slot["id"] = tool_call.id
                    if tool_call.function:
                        if tool_call.function.name:
                            slot["name"] += tool_call.function.name
                        if tool_call.function.arguments:
                            slot["arguments"] += tool_call.function.arguments
        except Exception as exc:
            logger.warning("LLM 流式请求失败：%s", exc)
            yield _sse({"type": "error", "message": "AI 服务暂时不可用，请稍后再试或联系人工客服"})
            return

        if not tool_calls_acc:
            break  # 模型没有再要工具，本轮已产出最终回答

        # 记录 assistant 的工具调用决定（OpenAI 协议要求回喂前先落 assistant 消息）
        ordered = sorted(tool_calls_acc.items())
        convo.append(
            {
                "role": "assistant",
                "content": "".join(content_parts) or None,
                "tool_calls": [
                    {
                        "id": slot["id"] or f"call_{index}",
                        "type": "function",
                        "function": {"name": slot["name"], "arguments": slot["arguments"] or "{}"},
                    }
                    for index, slot in ordered
                ],
            }
        )
        for index, slot in ordered:
            yield _sse({"type": "tool_call", "name": slot["name"], "args": _safe_json(slot["arguments"])})
            result = await tools.execute_tool(slot["name"], slot["arguments"])
            yield _sse({"type": "tool_result", "name": slot["name"], "result": result})
            convo.append(
                {
                    "role": "tool",
                    "tool_call_id": slot["id"] or f"call_{index}",
                    "content": json.dumps(result, ensure_ascii=False),
                }
            )
        # 继续下一轮：让模型基于工具结果组织回答

    # ---- 4. 收尾 ----
    yield _sse({"type": "done"})
