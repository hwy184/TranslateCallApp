import asyncio
import json
import logging
from livekit.agents import JobContext, WorkerOptions, cli, pipeline, stt, llm, tts
from livekit.plugins import silero
from plugins.stt.whisper import LocalWhisperSTT
from plugins.llm.ollama import create_ollama_llm, get_translation_system_prompt
from plugins.tts.edge_tts import EdgeTTS

# Cấu hình LOG
logger = logging.getLogger("voice-translator")
logger.setLevel(logging.INFO)

async def entrypoint(ctx: JobContext):
    logger.info(f"Connecting to room {ctx.room.name}")
    await ctx.connect()

    # 1. Đọc Metadata của phòng để cài đặt ngôn ngữ (Mặc định: vi -> en)
    metadata_json = ctx.room.metadata or "{}"
    try:
        room_data = json.loads(metadata_json)
    except json.JSONDecodeError:
        room_data = {}
    
    source_lang_code = room_data.get("source", "vi")
    target_lang_code = room_data.get("target", "en")
    
    # Bản đồ ngôn ngữ để LLM Prompt (vi -> Vietnamese, en -> English)
    lang_map = {"vi": "Vietnamese", "en": "English", "ja": "Japanese", "ko": "Korean"}
    source_lang_name = lang_map.get(source_lang_code, "Vietnamese")
    target_lang_name = lang_map.get(target_lang_code, "English")

    logger.info(f"Setting Pipeline: {source_lang_name} -> {target_lang_name}")

    # 2. Khởi tạo các Component từ Plugins
    # STT: Whisper cục bộ
    stt_plugin = LocalWhisperSTT(device="cuda")
    
    # LLM: Ollama (Dùng Gemma 4)
    llm_plugin = create_ollama_llm(model="gemma4:e4b")
    
    # TTS: Edge-TTS (Dùng giọng Aria Neural mặc định, rate nhanh hơn 15%)
    tts_plugin = EdgeTTS(rate="+15%")

    # 3. Tạo Chat Context ban đầu với System Prompt từ LLM Plugin
    initial_ctx = llm.ChatContext().append(
        role="system",
        text=get_translation_system_prompt(source_lang_name, target_lang_name),
    )

    # 4. Tạo VoicePipelineAgent (Bọc mọi thứ lại)
    agent = pipeline.VoicePipelineAgent(
        vad=silero.VAD.load(),
        stt=stt_plugin,
        llm=llm_plugin,
        tts=tts_plugin,
        chat_ctx=initial_ctx,
    )

    # 5. Xử lý bắn Text ra DataChannel (Phụ đề cho Frontend)
    @agent.on("user_speech_committed")
    def on_stt_final(msg: llm.ChatMessage):
        # Khi STT nghe xong câu gốc
        if msg.text:
            asyncio.create_task(ctx.room.local_participant.publish_data(
                json.dumps({"type": "stt", "text": msg.text}),
                topic="transcription"
            ))

    @agent.on("agent_speech_committed")
    def on_llm_final(msg: llm.ChatMessage):
        # Khi LLM đã dịch xong
        if msg.text:
            asyncio.create_task(ctx.room.local_participant.publish_data(
                json.dumps({"type": "translation", "text": msg.text}),
                topic="translation"
            ))

    # Bắt đầu chạy Agent trong phòng
    agent.start(ctx.room)
    
    # Chào mừng một chút (tùy chọn)
    await agent.say(f"Ready to translate from {source_lang_name} to {target_lang_name}.", allow_interruptions=True)

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
