# Danh sách câu ảo giác Whisper thường tự tạo ra khi nghe tạp âm
HALLUCINATION_BLACKLIST = [
    "subscribe", "lalaschool", "mì gõ", "ghiền mì", "subcribe", 
    "like and share", "bấm chuông", "kênh youtube", "video hấp dẫn",
    "cảm ơn các bạn đã xem", "hẹn gặp lại", "đăng ký kênh", "ủng hộ kênh",
    "kham phat", "khám phá", "top 10", "chào mừng các bạn", "theo dõi kênh",
]

def filter_hallucination(text: str) -> str:
    """Lọc các ảo giác ra khỏi văn bản."""
    clean_text = text.strip()
    if not clean_text:
        return ""
        
    lower_text = clean_text.lower().replace(" ", "")
    if any(bl.replace(" ", "") in lower_text for bl in HALLUCINATION_BLACKLIST):
        return ""
    
    return clean_text
