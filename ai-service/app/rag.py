"""RAG 检索层：知识库加载 + 混合检索（字级 bigram TF-IDF 词法检索 + 可选向量检索）。

检索策略（面试考点）：
- 词法检索：中文按「相邻两字」切成 bigram 统计 TF-IDF，不需要分词器、零外部依赖，
  对"押金怎么退"这类含关键词的问题命中很稳；缺点是不懂同义改写（"钱要不回来"匹配不上"退款"）。
- 向量检索：把文本变成 Embedding 向量算余弦相似度，懂语义；需要额外 API、有成本。
- 混合：两者加权融合（向量 0.6 + 词法 0.4），互补——向量兜住改写，词法兜住精确词。
  没配 Embedding 时自动退化为纯词法，本地开发零密钥也能跑。

为什么不用向量数据库（FAISS/Milvus）：知识库只有几十条 FAQ，暴力余弦毫秒级完成，
引入外部组件反而增加运维成本。语料涨到万级再换不迟——"按当前规模做最简正确实现"。
"""
import hashlib
import json
import logging
import math
import re
from dataclasses import dataclass
from pathlib import Path

from openai import AsyncOpenAI

from . import config

logger = logging.getLogger("rag")

# 混合检索权重：命中语义 vs 命中关键词
_VECTOR_WEIGHT = 0.6
_LEXICAL_WEIGHT = 0.4
# 低于该分数的片段视为无关，宁可不给上下文也不塞噪声（塞噪声会诱发幻觉）。
# 词法模式的无关长尾通常 <0.06；配了 Embedding 的混合模式语义分区分度更大，这个阈值更宽松地够用。
_MIN_SCORE = 0.06


@dataclass
class Chunk:
    chunk_id: int
    title: str
    text: str


def load_corpus(path: Path) -> list[Chunk]:
    """把 knowledge/faq.md 按 `## ` 二级标题切成块。

    FAQ 语料按「一问一节」的纪律维护，天然就是合适粒度的 chunk——
    不需要再做滑动窗口切分，检索粒度确定、引用标题现成。
    """
    raw = path.read_text(encoding="utf-8")
    chunks: list[Chunk] = []
    for section in re.split(r"\n(?=## )", raw):
        section = section.strip()
        if not section.startswith("## "):
            continue  # 跳过文件头说明等非正文部分
        lines = section.split("\n", 1)
        title = lines[0][3:].strip()
        text = lines[1].strip() if len(lines) > 1 else ""
        if title and text:
            chunks.append(Chunk(chunk_id=len(chunks), title=title, text=text))
    return chunks


def _char_bigrams(text: str) -> list[str]:
    """字级 bigram："押金退款" → ["押金", "金退", "退款"]。中文比英文更需要这个（没有空格分词）。"""
    cleaned = re.sub(r"\s+", "", text.lower())
    return [cleaned[i : i + 2] for i in range(len(cleaned) - 1)]


def _cosine(vec_a: dict, vec_b: dict) -> float:
    dot = sum(w * vec_b.get(g, 0.0) for g, w in vec_a.items())
    return dot  # 两个向量都已归一化，点积即余弦


class LexicalIndex:
    """TF-IDF 词法检索，纯标准库实现。"""

    def __init__(self, chunks: list[Chunk]):
        doc_freq: dict[str, int] = {}
        raw_tfs = []
        for chunk in chunks:
            tf: dict[str, int] = {}
            for gram in _char_bigrams(f"{chunk.title} {chunk.text}"):
                tf[gram] = tf.get(gram, 0) + 1
            raw_tfs.append(tf)
            for gram in tf:
                doc_freq[gram] = doc_freq.get(gram, 0) + 1
        total = max(1, len(chunks))
        # IDF：越稀有的词越有区分度；+1 平滑避免除零
        self._idf = {g: math.log((total + 1) / (df + 1)) + 1.0 for g, df in doc_freq.items()}
        self._doc_vectors = [self._to_weighted_vector(tf) for tf in raw_tfs]

    def _to_weighted_vector(self, tf: dict[str, int]) -> dict[str, float]:
        total_terms = max(1, sum(tf.values()))
        vec = {g: (c / total_terms) * self._idf.get(g, 0.0) for g, c in tf.items()}
        norm = math.sqrt(sum(w * w for w in vec.values())) or 1.0
        return {g: w / norm for g, w in vec.items()}  # L2 归一化，点积即余弦

    def search(self, query: str, k: int) -> list[tuple[int, float]]:
        query_vec = self._to_weighted_vector({g: 1 for g in set(_char_bigrams(query))})
        scores = [(i, _cosine(query_vec, doc)) for i, doc in enumerate(self._doc_vectors)]
        scores.sort(key=lambda pair: pair[1], reverse=True)
        return scores[:k]


class VectorIndex:
    """向量检索：调 OpenAI 兼容 /embeddings 接口；语料向量落盘缓存，重启不重复付费。"""

    def __init__(self, client: AsyncOpenAI, model: str):
        self._client = client
        self._model = model
        self._vectors: list[list[float]] = []

    async def build(self, chunks: list[Chunk]) -> None:
        corpus_md5 = hashlib.md5(
            "\n".join(f"{c.title}\n{c.text}" for c in chunks).encode("utf-8")
        ).hexdigest()
        cached = self._read_cache(corpus_md5)
        if cached is not None:
            self._vectors = cached
            logger.info("向量缓存命中：%d 条（模型 %s）", len(cached), self._model)
            return
        texts = [f"{c.title}\n{c.text}" for c in chunks]
        vectors: list[list[float]] = []
        for start in range(0, len(texts), 32):  # 分批请求，避免单次 payload 过大
            batch = texts[start : start + 32]
            resp = await self._client.embeddings.create(model=self._model, input=batch)
            vectors.extend(item.embedding for item in resp.data)
        self._vectors = vectors
        self._write_cache(corpus_md5, vectors)
        logger.info("语料向量化完成：%d 条（模型 %s）", len(vectors), self._model)

    async def embed_query(self, query: str) -> list[float]:
        resp = await self._client.embeddings.create(model=self._model, input=[query])
        return resp.data[0].embedding

    def search(self, query_vector: list[float], k: int) -> list[tuple[int, float]]:
        qnorm = math.sqrt(sum(x * x for x in query_vector)) or 1.0
        scores = []
        for i, vec in enumerate(self._vectors):
            dot = sum(a * b for a, b in zip(query_vector, vec))
            dnorm = math.sqrt(sum(x * x for x in vec)) or 1.0
            scores.append((i, dot / (qnorm * dnorm)))
        scores.sort(key=lambda pair: pair[1], reverse=True)
        return scores[:k]

    def _read_cache(self, corpus_md5: str) -> list[list[float]] | None:
        try:
            data = json.loads(config.EMBEDDING_CACHE_FILE.read_text(encoding="utf-8"))
            if data.get("model") == self._model and data.get("corpus_md5") == corpus_md5:
                return data.get("vectors")
        except (OSError, ValueError):
            pass
        return None

    def _write_cache(self, corpus_md5: str, vectors: list[list[float]]) -> None:
        try:
            config.EMBEDDING_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            config.EMBEDDING_CACHE_FILE.write_text(
                json.dumps({"model": self._model, "corpus_md5": corpus_md5, "vectors": vectors}),
                encoding="utf-8",
            )
        except OSError:
            logger.warning("向量缓存写入失败（只读文件系统？），下次启动会重新向量化")


class HybridRetriever:
    """对外门面：启动时建索引，请求时检索。"""

    def __init__(self):
        self.chunks: list[Chunk] = []
        self.mode = "empty"
        self._lexical: LexicalIndex | None = None
        self._vector: VectorIndex | None = None

    @property
    def ready(self) -> bool:
        return self._lexical is not None

    async def load(self) -> None:
        self.chunks = load_corpus(config.KNOWLEDGE_FILE)
        self._lexical = LexicalIndex(self.chunks)
        if config.EMBEDDING_BASE_URL and config.EMBEDDING_API_KEY and config.EMBEDDING_MODEL:
            client = AsyncOpenAI(
                base_url=config.EMBEDDING_BASE_URL, api_key=config.EMBEDDING_API_KEY
            )
            self._vector = VectorIndex(client, config.EMBEDDING_MODEL)
            try:
                await self._vector.build(self.chunks)
            except Exception as exc:  # 向量化失败不阻塞启动：降级为纯词法检索
                logger.warning("Embedding 初始化失败，降级为纯词法检索：%s", exc)
                self._vector = None
        self.mode = "hybrid" if self._vector else "lexical"
        logger.info("RAG 索引就绪：%d 条知识，模式 %s", len(self.chunks), self.mode)

    async def search(self, query: str, k: int | None = None) -> list[dict]:
        """返回 [{"title", "text", "score"}]，按相关度降序；无命中返回空列表。"""
        if not self.ready or not query.strip():
            return []
        k = k or config.RAG_TOP_K

        lexical_scores = dict(self._lexical.search(query, k))
        vector_scores: dict[int, float] = {}
        if self._vector:
            try:
                query_vector = await self._vector.embed_query(query)
                vector_scores = dict(self._vector.search(query_vector, k))
            except Exception as exc:
                logger.warning("查询向量化失败，本轮只用词法分数：%s", exc)

        # 只对「实际可用」的检索器加权：只有一路时权重应为 1.0，
        # 否则固定权重会把分数凭空打八折，把弱相关但正确的命中挤到阈值以下（冒烟测试踩过的坑）
        has_vector, has_lexical = bool(vector_scores), bool(lexical_scores)
        candidates = set(lexical_scores) | set(vector_scores)
        scored = []
        for chunk_id in candidates:
            vec_score = vector_scores.get(chunk_id, 0.0)
            lex_score = lexical_scores.get(chunk_id, 0.0)
            if has_vector and has_lexical:
                score = _VECTOR_WEIGHT * vec_score + _LEXICAL_WEIGHT * lex_score
            else:
                score = vec_score if has_vector else lex_score
            if score < _MIN_SCORE:
                continue
            chunk = self.chunks[chunk_id]
            scored.append({"title": chunk.title, "text": chunk.text, "score": round(score, 4)})
        scored.sort(key=lambda item: item["score"], reverse=True)
        return scored[:k]
