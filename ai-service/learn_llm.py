"""裸调大模型：最小可运行的学习脚本（不依赖项目其他代码）。

跑法：cd ai-service 后执行  .venv\\Scripts\\python learn_llm.py
"""
import os
import sys

from dotenv import load_dotenv
from openai import OpenAI

sys.stdout.reconfigure(encoding="utf-8")   # Windows 控制台默认 GBK，中文会乱码

# 从同目录 .env 读 AI_LLM_API_KEY——密钥永远不写进代码（写进代码就会跟着 git 泄露）
load_dotenv()

# DeepSeek 兼容 OpenAI 协议：同一套 SDK，换个 base_url 就是换了厂商
client = OpenAI(base_url="https://api.deepseek.com", api_key=os.environ["AI_LLM_API_KEY"])

# 一次调用 = 发一组消息，收模型补全的下一条消息
resp = client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role": "user", "content": "用一句话介绍你自己"}],
)

print(resp.choices[0].message.content)   # 模型的回答
print("---- 本次消耗 ----")
print(resp.usage)                        # token 用量：这就是计费依据
