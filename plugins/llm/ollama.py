from livekit.plugins import openai
from typing import Optional

def create_ollama_llm(
    model: str = "gemma4:e4b",
    base_url: str = "http://localhost:11434/v1",
    temperature: float = 0.1
) -> openai.LLM:
    """
    Tạo một instance LLM (OpenAI-compatible) kết nối tới Ollama cục bộ.
    
    Args:
        model: Tên model đã pull trong Ollama (mặc định gemma4:e4b).
        base_url: URL của Ollama API (chuẩn OpenAI).
        temperature: Độ sáng tạo thấp để ưu tiên tính chính xác khi dịch.
    """
    return openai.LLM.with_ollama(
        model=model,
        base_url=base_url,
        temperature=temperature
    )

def get_translation_system_prompt(source_lang: str = "Vietnamese", target_lang: str = "English") -> str:
    """
    Tạo System Prompt cho Agent đóng vai trò dịch thuật chuyên nghiệp.
    """
    return (
        f"You are a professional {source_lang}-to-{target_lang} translator. "
        f"Translate the user's {source_lang} text to natural {target_lang}. "
        f"Output ONLY the {target_lang} translation. No quotes, no explanations."
    )
