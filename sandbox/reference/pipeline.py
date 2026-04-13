import asyncio
import json
import logging
import multiprocessing
import sys
from dotenv import load_dotenv

# Ép Windows dùng SelectorEventLoop nếu gặp lỗi WinError 87 (Tùy chọn, tùy phiên bản Python)
# if sys.platform == 'win32':
#     asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

load_dotenv()
from livekit.agents import JobContext, WorkerOptions, cli, llm, voice
from livekit.plugins import silero
from plugins.stt.whisper import LocalWhisperSTT
from plugins.llm.ollama import create_ollama_llm, get_translation_system_prompt
from plugins.tts.edge_tts import EdgeTTS

logger = logging.getLogger("voice-translator")

# Tải model STT Singleton
_stt_model = None
def get_stt_model():
    global _stt_model
    if _stt_model is None:
        logger.info("--- INITIALIZING WHISPER MODEL (PLEASE WAIT) ---")
        _stt_model = LocalWhisperSTT()
    return _stt_model

async def entrypoint(ctx: JobContext):
    source_lang_name = "Vietnamese"
    target_lang_name = "English"
    
    logger.info(f"--- AGENT CONNECTING TO ROOM: {ctx.room.name} ---")
    await ctx.connect()
    
    # Khởi tạo Plugins
    stt_plugin = get_stt_model()
    # Dùng gemma2:2b cho nhẹ nhàng và nhanh trên máy cá nhân
    llm_plugin = create_ollama_llm(model="gemma2:2b")
    tts_plugin = EdgeTTS(rate="+15%")

    # Tạo Agent 1.5.x
    agent = voice.Agent(
        instructions=get_translation_system_prompt(source_lang_name, target_lang_name),
        stt=stt_plugin,
        llm=llm_plugin,
        tts=tts_plugin,
        vad=silero.VAD.load(),
    )

    @agent.on("user_transcript_finished")
    def on_user_transcript(event: voice.UserTranscriptFinished):
        if event.text:
            logger.info(f"User: {event.text}")
            asyncio.create_task(ctx.room.local_participant.publish_data(
                json.dumps({"type": "stt", "text": event.text}),
                topic="transcription"
            ))

    @agent.on("agent_transcript_finished")
    def on_agent_transcript(event: voice.AgentTranscriptFinished):
        if event.text:
            logger.info(f"Agent: {event.text}")
            asyncio.create_task(ctx.room.local_participant.publish_data(
                json.dumps({"type": "translation", "text": event.text}),
                topic="transcription"
            ))

    # BẮT ĐẦU CHẠY
    ctx.start(agent)
    
    logger.info("--- AGENT START SUCCESSFUL ---")
    await agent.say("Chào bạn! Tôi đã sẵn sàng dịch tiếng Việt sang tiếng Anh.", allow_interruptions=True)

if __name__ == "__main__":
    multiprocessing.freeze_support()
    # Chạy ở độ ưu tiên cao để tránh lag
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
