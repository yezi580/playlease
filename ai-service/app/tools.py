"""Function Calling 工具：把大模型的结构化决策翻译成对主站 Node 接口的 HTTP 查询。

机制（面试考点）：模型只负责「点菜」——输出要调哪个工具、参数是什么（结构化 JSON）；
真正的执行发生在我们的代码里，结果再回喂给模型组织成回答。模型碰不到数据库，
也就没有幻觉直接写坏数据的通道。

安全边界：只提供「读」操作（搜商品、看详情），绝不封装下单/支付/资金接口。
金额单位：Node 接口对外已是「元」，查询参数 minRent/maxRent 也是元——不需要换算。
"""
import json
import logging

import httpx

from . import config

logger = logging.getLogger("tools")

_NODE_TIMEOUT = 10.0
_MAX_LISTINGS_FOR_LLM = 5  # 一次最多给模型 5 条，够回答又省 token

_SORT_OPTIONS = [
    "hot", "latest",
    "rent_asc", "rent_desc",
    "ratio_asc", "ratio_desc",
    "hafu_asc", "hafu_desc",
    "awm_desc", "helmet_desc", "armor_desc",
]

# OpenAI 规范的 tools 声明：模型据此决定何时调用、传什么参数
TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "search_listings",
            "description": (
                "搜索本站在租的三角洲行动账号商品。用户想找号/选号/比价时调用，"
                "例如『日租50以内』『找个四川的号』『带AWM子弹的号』。"
                "只传用户明确表达过的条件，不要自行脑补筛选。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "minRent": {"type": "number", "description": "买家实付日租金下限（元）"},
                    "maxRent": {"type": "number", "description": "买家实付日租金上限（元）"},
                    "items": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "要求的物品名列表，如：AWM子弹、6级头盔、曼德尔砖",
                    },
                    "region": {"type": "string", "description": "地区（省或市名），如：四川、成都"},
                    "characterLevelMin": {"type": "integer", "description": "角色等级下限"},
                    "characterLevelMax": {"type": "integer", "description": "角色等级上限"},
                    "rank": {"type": "string", "description": "段位名"},
                    "loginMethod": {"type": "string", "description": "登录方式"},
                    "loginTimeRange": {
                        "type": "string",
                        "enum": ["day", "night"],
                        "description": "可上号时间段：day=白天，night=夜间",
                    },
                    "sortBy": {"type": "string", "enum": _SORT_OPTIONS, "description": "结果排序方式"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_listing_detail",
            "description": "按商品编号查看单个账号商品的详情（属性、物品清单、价格）。用户询问某个具体编号的商品时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "listingNo": {"type": "string", "description": "商品编号（页面展示的编号）"}
                },
                "required": ["listingNo"],
            },
        },
    },
]


async def execute_tool(name: str, raw_args: str) -> dict:
    """执行一次工具调用。永远返回 dict、绝不抛异常——把错误作为结果回喂给模型，
    让模型自己决定怎么向用户解释，也保证 SSE 流不会中途断掉。"""
    try:
        args = json.loads(raw_args or "{}")
        if not isinstance(args, dict):
            return {"error": "工具参数必须是 JSON 对象"}
    except json.JSONDecodeError:
        return {"error": "工具参数不是合法 JSON"}

    try:
        if name == "search_listings":
            return await _search_listings(args)
        if name == "get_listing_detail":
            return await _get_listing_detail(args)
        return {"error": f"未知工具：{name}"}
    except httpx.TimeoutException:
        return {"error": "查询主站服务超时，请建议用户稍后再试"}
    except Exception as exc:
        logger.warning("工具 %s 执行失败：%s", name, exc)
        return {"error": f"工具执行失败：{type(exc).__name__}"}


def _cent_to_yuan(value):
    """Node 接口金额单位是「分」（内部惯例）；对模型和用户展示统一转成元。

    单位换算错 100 倍是金额场景最典型的静默 bug——工具层统一收口换算，
    模型拿到的永远是元，不用在每个调用点记单位。
    """
    if value is None or value == "":
        return None
    try:
        return round(float(value) / 100, 2)
    except (TypeError, ValueError):
        return None


def _compact_listing(row: dict) -> dict:
    """从列表行里挑模型和前端卡片需要的字段，去掉空值省 token。"""
    mapping = {
        "listingNo": row.get("listing_no"),
        "url": f"/listings/{row.get('listing_no')}" if row.get("listing_no") else None,
        "rent": _cent_to_yuan(row.get("rent_price")),          # 基础日租金（元）
        "deposit": _cent_to_yuan(row.get("deposit")),          # 押金（元）
        "rentDays": row.get("rent_days"),
        "hafuCoin": row.get("hafu_coin"),
        "ratio": row.get("base_ratio"),
        "characterLevel": row.get("character_level"),
        "rank": row.get("rank_name"),
        "region": row.get("region"),
        "insurance": row.get("insurance_level"),
        "loginMethod": row.get("login_method"),
        "loginTime": row.get("login_time_range"),
        "awmBullets": row.get("awm_bullet_qty"),
        "bulletLv6": row.get("bullet_lv6_qty"),
        "recentClicks7d": row.get("recent_unique_click_7d"),
        "remark": _truncate(row.get("remark") or "", 60),
    }
    return {key: value for key, value in mapping.items() if value not in (None, "")}


def _truncate(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _build_listing_query(args: dict) -> dict:
    """LLM 参数 → Node GET /api/listings 的查询参数。白名单式映射，未知键一律丢弃。"""
    params: dict = {}
    if isinstance(args.get("minRent"), (int, float)):
        params["minRent"] = args["minRent"]
    if isinstance(args.get("maxRent"), (int, float)):
        params["maxRent"] = args["maxRent"]
    items = args.get("items")
    if isinstance(items, list) and items:
        params["items"] = ",".join(str(item).strip() for item in items if str(item).strip())
    for key in ("region", "rank", "loginMethod", "loginTimeRange", "sortBy"):
        value = args.get(key)
        if isinstance(value, str) and value.strip():
            params[key] = value.strip()
    level_min, level_max = args.get("characterLevelMin"), args.get("characterLevelMax")
    if isinstance(level_min, (int, float)) or isinstance(level_max, (int, float)):
        # Node 侧 characterLevel 支持 "min-max" 区间语法
        params["characterLevel"] = f"{level_min or ''}-{level_max or ''}"
    params["page"] = 1
    params["pageSize"] = _MAX_LISTINGS_FOR_LLM
    return params


async def _get_json(path: str, params: dict | None = None) -> dict:
    """带一次重试的 GET（只重试连接类错误）。

    生产环境 NODE_BASE_URL 指向蓝绿双 api 的网络别名，某色重建的窗口期里
    DNS 可能轮询到刚下线的 IP——重试一次大概率落到活着的那色。
    """
    last_error: Exception | None = None
    for _attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=_NODE_TIMEOUT) as client:
                resp = await client.get(f"{config.NODE_BASE_URL}{path}", params=params)
                resp.raise_for_status()
                return resp.json()
        except httpx.TransportError as exc:  # 连接/网络类错误才值得重试
            last_error = exc
            continue
    raise last_error  # type: ignore[misc]


async def _search_listings(args: dict) -> dict:
    params = _build_listing_query(args)
    payload = await _get_json("/api/listings", params)
    rows = payload.get("list") or []
    return {
        "total": payload.get("total", 0),
        "page": payload.get("page", 1),
        "pageSize": payload.get("pageSize", _MAX_LISTINGS_FOR_LLM),
        "list": [_compact_listing(row) for row in rows],
        "note": "rent 为卖家基础日租金（元）；买家实付约为 rent × 1.1（含平台服务费，以页面展示为准）。",
    }


async def _get_listing_detail(args: dict) -> dict:
    listing_no = str(args.get("listingNo") or "").strip()
    if not listing_no:
        return {"error": "缺少商品编号 listingNo"}
    payload = await _get_json(f"/api/listings/{listing_no}")

    items = [
        {
            "name": item.get("item_name"),
            "quantity": item.get("quantity"),
            "unitPrice": _cent_to_yuan(item.get("unit_price")),  # 元；物品结算价以申报页面展示为准
        }
        for item in (payload.get("items") or [])[:20]
    ]
    compact = _compact_listing(payload)
    compact["items"] = items
    compact["imageCount"] = len(payload.get("images") or [])
    return compact
