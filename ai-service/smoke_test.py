"""本地冒烟测试：不调任何外部 API，验证语料加载、词法检索、工具参数映射。

跑法：.venv\\Scripts\\python smoke_test.py
"""
import asyncio
import sys

sys.stdout.reconfigure(encoding="utf-8")  # Windows 控制台默认 GBK，中文会乱码
sys.path.insert(0, ".")

from app.rag import HybridRetriever, load_corpus  # noqa: E402
from app.tools import _build_listing_query  # noqa: E402


async def main() -> None:
    # 1. 语料加载
    chunks = load_corpus(__import__("pathlib").Path("knowledge/faq.md"))
    print(f"[1] 语料加载：{len(chunks)} 条知识")
    assert len(chunks) >= 20, "FAQ 条数异常"

    # 2. 词法检索（无 Embedding 配置 → 纯词法模式）
    retriever = HybridRetriever()
    await retriever.load()
    print(f"[2] 索引模式：{retriever.mode}")
    assert retriever.ready

    for query, expect_keyword in [
        ("押金什么时候退", "押金"),
        ("怎么取消订单", "取消"),
        ("我想出租我的账号", "发布"),
        ("今天天气怎么样", None),  # 无关问题应低分落空
    ]:
        hits = await retriever.search(query)
        titles = [hit["title"] for hit in hits]
        print(f"    「{query}」→ {titles}")
        if expect_keyword:
            assert any(expect_keyword in title for title in titles), f"检索未命中：{query}"

    # 3. 工具参数映射
    params = _build_listing_query(
        {"maxRent": 50, "items": ["AWM子弹", "6级头盔"], "region": "四川",
         "characterLevelMin": 40, "sortBy": "rent_asc", "hack": "drop table"}
    )
    print(f"[3] 工具参数映射：{params}")
    assert params["maxRent"] == 50 and params["region"] == "四川"
    assert params["characterLevel"] == "40-"
    assert "hack" not in params, "未知参数必须被白名单丢弃"

    print("\n全部通过 ✔")


asyncio.run(main())
